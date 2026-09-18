// ============================================
// إعداد اتصال Supabase
// ⚠️ عدّل القيمتين التاليتين بمعلومات مشروعك
// (تجدهما في: Supabase Dashboard → Project Settings → API)
// ============================================

const SUPABASE_URL = "https://xewxzqclrtachuqvioct.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_tF-4kr96F4cT5fJs14j11w_5Zoo1VqD";

// عميل Supabase (متاح عالمياً لبقية ملفات JS عبر <script> عادي)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// رابط الـ Edge Function الخاصة بإنشاء المستخدمين
const CREATE_USER_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-user`;

// رابط الـ Edge Function الخاصة بإنشاء فيديو في Bunny Stream وتوليد توقيع الرفع
const CREATE_BUNNY_VIDEO_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-bunny-video`;
