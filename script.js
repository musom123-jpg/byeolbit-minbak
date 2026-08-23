const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  navbar.style.boxShadow = window.scrollY > 10 ? '0 2px 12px rgba(0,0,0,0.25)' : 'none';
});

// Supabase publishable key: 브라우저에 노출되도록 설계된 키입니다 (RLS로 접근 범위 제한).
const SUPABASE_URL = 'https://mdpnatpjkzkryjqfbhru.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8AMXpKtTIh6mSAwqCscxgA_s6cSuu0y';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const inquiryForm = document.getElementById('inquiry-form');
const inquiryStatus = document.getElementById('inquiry-status');

inquiryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = inquiryForm.querySelector('button[type="submit"]');
  const formData = new FormData(inquiryForm);

  const payload = {
    name: formData.get('name').trim(),
    phone: formData.get('phone').trim(),
    checkin: formData.get('checkin') || null,
    checkout: formData.get('checkout') || null,
    message: formData.get('message').trim() || null
  };

  submitBtn.disabled = true;
  inquiryStatus.textContent = '문의를 보내는 중입니다...';
  inquiryStatus.className = 'inquiry-status';

  const { error } = await supabaseClient.from('inquiries').insert(payload);

  submitBtn.disabled = false;

  if (error) {
    console.error(error);
    inquiryStatus.textContent = '문의 전송에 실패했습니다. 전화로 문의해 주세요.';
    inquiryStatus.classList.add('is-error');
    return;
  }

  inquiryStatus.textContent = '문의가 접수되었습니다. 빠르게 연락드리겠습니다!';
  inquiryStatus.classList.add('is-success');
  inquiryForm.reset();
});
