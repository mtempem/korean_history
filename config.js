// Supabase 연결 설정 — 비워 두면 기록은 이 브라우저(localStorage)에만 저장된다.
// 값은 Supabase 대시보드 > Project Settings > API 에서 복사한다.
// anon key는 공개돼도 괜찮은 키다(데이터 보호는 supabase/schema.sql 의 보안 규칙이 맡는다).
// service_role 키는 절대 넣지 말 것.
window.HQ_CONFIG = {
  supabaseUrl: 'https://chugiaapralopactxzum.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNodWdpYWFwcmFsb3BhY3R4enVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjY4NDYsImV4cCI6MjEwNzMwMjg0Nn0.xD0B9UINg2pEs0KHLniG6tCH49oU38AxCqLhsJbZ_J8',  // 예: 'eyJhbGciOi...'
};
