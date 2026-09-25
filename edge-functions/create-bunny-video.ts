// create-bunny-video/index.ts
// الوسيط الآمن بين لوحتنا و Bunny Stream — لا يُرسل ملف الفيديو نفسه،
// فقط يُنشئ "غلاف" الفيديو في Bunny ويولّد توقيع رفع مؤقت (TUS)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) التحقق من هوية المستدعي ودوره (نفس نمط create-user)
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await userClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "هذا الإجراء متاح للأدمن فقط" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "عنوان الفيديو مطلوب" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const libraryId = Deno.env.get("BUNNY_LIBRARY_ID")!;
    const apiKey = Deno.env.get("BUNNY_API_KEY")!;

    // 2) إنشاء "غلاف" الفيديو في مكتبة Bunny (بدون رفع أي محتوى بعد)
    const createRes = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: "POST",
      headers: { "AccessKey": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return new Response(JSON.stringify({ error: `تعذّر إنشاء الفيديو في Bunny: ${errText}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const videoData = await createRes.json();
    const videoId = videoData.guid;

    // 3) توليد توقيع الرفع المؤقت (TUS Authorization Signature)
    // الصيغة الرسمية من Bunny: SHA256( libraryId + apiKey + expirationTime + videoId )
    const expirationTime = Math.floor(Date.now() / 1000) + 43200; // صالح لـ 12 ساعة (يدعم الفيديوهات الطويلة والإنترنت البطيء)
    const signatureInput = `${libraryId}${apiKey}${expirationTime}${videoId}`;

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(signatureInput));
    const signature = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // 4) إرجاع كل ما يحتاجه المتصفح للرفع المباشر — بدون كشف apiKey أبداً
    return new Response(JSON.stringify({
      videoId,
      libraryId,
      expirationTime,
      signature,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
