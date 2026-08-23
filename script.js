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

// 객실 안내: 관리자 페이지(객실 관리)에서 저장한 내용으로 카드를 채웁니다.
(async function loadRooms() {
  const grid = document.getElementById('roomGrid');
  const { data, error } = await supabaseClient
    .from('rooms')
    .select('name, description, price_per_night, image_url')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error || !data || !data.length) return;

  grid.innerHTML = '';
  data.forEach(({ name, description, price_per_night, image_url }) => {
    const card = document.createElement('div');
    card.className = 'room-card';

    if (image_url) {
      const img = document.createElement('img');
      img.src = image_url;
      img.alt = name;
      img.className = 'room-photo';
      // 등록된 URL이 깨져 있으면(예: 예전 자리표시자 경로) 플레이스홀더로 대체
      img.addEventListener('error', () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'ph-image';
        placeholder.textContent = '사진 준비중';
        img.replaceWith(placeholder);
      });
      card.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'ph-image';
      placeholder.textContent = '사진 준비중';
      card.appendChild(placeholder);
    }

    card.insertAdjacentHTML('beforeend', `
      <h3>${name}</h3>
      <p>${description || ''}</p>
      <p class="room-price">1박 ${Number(price_per_night).toLocaleString('ko-KR')}원~</p>
    `);

    grid.appendChild(card);
  });
})();

// 요금 안내 표: 관리자 페이지(요금 안내 관리)에서 저장한 내용으로 채웁니다.
(async function loadPriceTable() {
  const tbody = document.getElementById('priceTableBody');
  const { data, error } = await supabaseClient
    .from('price_table_rows')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error || !data || !data.length) return;

  const won = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('ko-KR') + '원');

  tbody.innerHTML = data
    .map((row) => `
      <tr>
        <td>${row.room_name}</td>
        <td>${row.capacity_base ?? '-'}인</td>
        <td>${row.capacity_max ?? '-'}인</td>
        <td>${won(row.off_weekday)}</td>
        <td>${won(row.off_weekend)}</td>
        <td>${won(row.peak_weekday)}</td>
        <td>${won(row.peak_weekend)}</td>
        <td>${won(row.superpeak_weekday)}</td>
        <td>${won(row.superpeak_weekend)}</td>
      </tr>
    `)
    .join('');
})();

// 갤러리: 관리자가 등록한 사진이 있으면 대체하고, 없으면 "사진 준비중" 플레이스홀더를 유지합니다.
(async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  const { data, error } = await supabaseClient
    .from('gallery_photos')
    .select('image_url')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error || !data || !data.length) return;

  grid.innerHTML = data
    .map(({ image_url }) => `<img src="${image_url}" alt="별빛민박 갤러리 사진" class="gallery-photo">`)
    .join('');
})();
