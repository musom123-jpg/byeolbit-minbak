const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../supabaseClient');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PHOTO_BUCKET = 'site-photos';

function safeExt(originalname) {
  return (originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
}

// 관리자용 예약 목록 (기간 겹치는 예약 전체, 취소건 포함)
// GET /booking/api/admin/reservations?from=2026-08-01&to=2026-08-31
router.get('/reservations', async (req, res) => {
  const { from, to } = req.query;

  let query = supabase
    .from('reservations')
    .select('*, rooms(name)')
    .order('checkin', { ascending: true });

  if (from) query = query.gte('checkout', from);
  if (to) query = query.lte('checkin', to);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '예약 목록을 불러오지 못했습니다.' });
  }

  const reservations = data.map(({ rooms, ...r }) => ({ ...r, room_name: rooms ? rooms.name : null }));
  res.json(reservations);
});

// 예약 상태 변경 (관리자가 가예약 취소 등을 처리할 때 사용)
router.patch('/reservations/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['PENDING', 'PAID', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: '잘못된 상태 값입니다.' });
  }

  const { error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', req.params.id);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '상태 변경에 실패했습니다.' });
  }
  res.json({ ok: true });
});

// 객실 목록 (비노출 객실 포함) - 관리자 객실 관리 화면용
router.get('/rooms', async (req, res) => {
  const { data, error } = await supabase.from('rooms').select('*').order('id');
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '객실 목록을 불러오지 못했습니다.' });
  }
  res.json(data);
});

// 객실 정보 수정 (이름/설명/인원/가격/노출여부)
router.patch('/rooms/:id', async (req, res) => {
  const { name, description, capacity, price_per_night, is_active } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = String(name);
  if (description !== undefined) patch.description = String(description);
  if (capacity !== undefined) {
    const n = Number(capacity);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: '인원은 1 이상의 숫자여야 합니다.' });
    patch.capacity = n;
  }
  if (price_per_night !== undefined) {
    const n = Number(price_per_night);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: '가격은 0 이상의 숫자여야 합니다.' });
    patch.price_per_night = n;
  }
  if (is_active !== undefined) patch.is_active = Boolean(is_active);

  const { data, error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '객실 정보를 저장하지 못했습니다.' });
  }
  res.json(data);
});

// 객실 사진 업로드 (Supabase Storage에 저장 후 image_url 갱신)
router.post('/rooms/:id/photo', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '사진 파일이 필요합니다.' });

  const filePath = `rooms/room-${req.params.id}-${Date.now()}.${safeExt(req.file.originalname)}`;

  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (uploadErr) {
    console.error(uploadErr);
    return res.status(500).json({ error: `사진 업로드에 실패했습니다. (${uploadErr.message})` });
  }

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('rooms')
    .update({ image_url: publicUrlData.publicUrl })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '사진 URL 저장에 실패했습니다.' });
  }
  res.json(data);
});

// 갤러리 사진 목록 (관리자용, 최신순)
router.get('/gallery', async (req, res) => {
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '갤러리 목록을 불러오지 못했습니다.' });
  }
  res.json(data);
});

// 갤러리 사진 추가
router.post('/gallery', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '사진 파일이 필요합니다.' });

  const filePath = `gallery/gallery-${Date.now()}.${safeExt(req.file.originalname)}`;

  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (uploadErr) {
    console.error(uploadErr);
    return res.status(500).json({ error: `사진 업로드에 실패했습니다. (${uploadErr.message})` });
  }

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('gallery_photos')
    .insert({ image_url: publicUrlData.publicUrl, storage_path: filePath })
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '갤러리 사진 저장에 실패했습니다.' });
  }
  res.json(data);
});

// 갤러리 사진 삭제
router.delete('/gallery/:id', async (req, res) => {
  const { data: photo, error: findErr } = await supabase
    .from('gallery_photos')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (findErr || !photo) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

  if (photo.storage_path) {
    const { error: removeErr } = await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
    if (removeErr) console.error('스토리지 파일 삭제 실패:', removeErr);
  }

  const { error } = await supabase.from('gallery_photos').delete().eq('id', req.params.id);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '사진 삭제에 실패했습니다.' });
  }
  res.json({ ok: true });
});

const PRICE_TABLE_NUMERIC_FIELDS = [
  'capacity_base', 'capacity_max',
  'off_weekday', 'off_weekend',
  'peak_weekday', 'peak_weekend',
  'superpeak_weekday', 'superpeak_weekend'
];

// 요금 안내 표 목록
router.get('/price-table', async (req, res) => {
  const { data, error } = await supabase
    .from('price_table_rows')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '요금 안내를 불러오지 못했습니다.' });
  }
  res.json(data);
});

// 요금 안내 행 추가
router.post('/price-table', async (req, res) => {
  const { data: maxRow } = await supabase
    .from('price_table_rows')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('price_table_rows')
    .insert({
      room_name: '새 객실',
      sort_order: (maxRow?.sort_order || 0) + 1
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '행을 추가하지 못했습니다.' });
  }
  res.json(data);
});

// 요금 안내 행 수정
router.patch('/price-table/:id', async (req, res) => {
  const patch = {};
  if (req.body.room_name !== undefined) patch.room_name = String(req.body.room_name);

  for (const field of PRICE_TABLE_NUMERIC_FIELDS) {
    if (req.body[field] === undefined) continue;
    const n = Number(req.body[field]);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: '숫자 항목은 0 이상이어야 합니다.' });
    }
    patch[field] = n;
  }

  const { data, error } = await supabase
    .from('price_table_rows')
    .update(patch)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '저장하지 못했습니다.' });
  }
  res.json(data);
});

// 요금 안내 행 삭제
router.delete('/price-table/:id', async (req, res) => {
  const { error } = await supabase.from('price_table_rows').delete().eq('id', req.params.id);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '삭제하지 못했습니다.' });
  }
  res.json({ ok: true });
});

// 예약 문의 내역 (최신순)
router.get('/inquiries', async (req, res) => {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '문의 내역을 불러오지 못했습니다.' });
  }
  res.json(data);
});

// 문의 삭제 (처리 완료된 문의 정리용)
router.delete('/inquiries/:id', async (req, res) => {
  const { error } = await supabase.from('inquiries').delete().eq('id', req.params.id);
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '삭제하지 못했습니다.' });
  }
  res.json({ ok: true });
});

// 텍스트 설정값 조회 (예: 요금 안내 표 하단 입/퇴실 안내 문구)
router.get('/settings/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', req.params.key)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '설정값을 불러오지 못했습니다.' });
  }
  res.json({ key: req.params.key, value: data ? data.value : '' });
});

// 텍스트 설정값 저장
router.put('/settings/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ key: req.params.key, value: String(req.body.value ?? '') })
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '설정값을 저장하지 못했습니다.' });
  }
  res.json(data);
});

module.exports = router;
