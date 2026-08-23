-- 별빛민박 Supabase 스키마
-- Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를 붙여넣고 Run 하세요.

create extension if not exists btree_gist;

-- 객실
create table if not exists rooms (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  capacity integer not null default 2,
  price_per_night integer not null,
  image_url text,
  is_active boolean not null default true
);

-- 예약
create table if not exists reservations (
  id bigint generated always as identity primary key,
  order_id text not null unique,
  room_id bigint not null references rooms(id),
  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  checkin date not null,
  checkout date not null,
  guests integer not null default 1,
  nights integer not null,
  total_price integer not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELLED')),
  payment_key text,
  deposit_amount integer,
  memo text,
  created_at timestamptz not null default now()
);

alter table reservations add column if not exists deposit_amount integer;

create index if not exists idx_reservations_room_dates on reservations (room_id, checkin, checkout);

-- 같은 방, 같은 기간에 PENDING/PAID 예약이 겹치지 않도록 DB 차원에서 강제 (동시 예약 방지)
alter table reservations drop constraint if exists no_overlapping_reservations;
alter table reservations
  add constraint no_overlapping_reservations
  exclude using gist (
    room_id with =,
    daterange(checkin, checkout, '[)') with &&
  ) where (status in ('PENDING', 'PAID'));

-- 홈페이지 "예약 문의" 폼에서 오는 문의 (브라우저에서 직접 저장)
create table if not exists inquiries (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  checkin date,
  checkout date,
  message text,
  created_at timestamptz not null default now()
);

-- RLS 활성화
alter table rooms enable row level security;
alter table reservations enable row level security;
alter table inquiries enable row level security;

-- rooms: 누구나 활성 객실 조회 가능 (홈페이지/예약 시스템에서 목록 표시)
drop policy if exists "rooms are publicly readable" on rooms;
create policy "rooms are publicly readable"
  on rooms for select
  using (is_active = true);

-- rooms: 객실 등록/수정은 seed.js 등 서버 스크립트(anon key, 브라우저에 노출되지 않음)에서만 사용
drop policy if exists "rooms insert via server" on rooms;
create policy "rooms insert via server"
  on rooms for insert
  with check (true);

drop policy if exists "rooms update via server" on rooms;
create policy "rooms update via server"
  on rooms for update
  using (true) with check (true);

-- reservations: booking 서버(anon key)가 예약 생성/조회/결제상태 업데이트/만료건 정리를 수행
-- 주의: 이 프로젝트는 booking 서버만 anon key를 쓰고 브라우저에는 노출하지 않는 것을 전제로 합니다.
drop policy if exists "reservations insert via server" on reservations;
create policy "reservations insert via server"
  on reservations for insert
  with check (true);

drop policy if exists "reservations select via server" on reservations;
create policy "reservations select via server"
  on reservations for select
  using (true);

drop policy if exists "reservations update via server" on reservations;
create policy "reservations update via server"
  on reservations for update
  using (true) with check (true);

drop policy if exists "reservations delete via server" on reservations;
create policy "reservations delete via server"
  on reservations for delete
  using (true);

-- inquiries: 브라우저에서 누구나 문의를 "남길" 수는 있음(insert)
drop policy if exists "anyone can submit an inquiry" on inquiries;
create policy "anyone can submit an inquiry"
  on inquiries for insert
  with check (true);

-- inquiries: 조회/삭제는 booking 서버(anon key, 관리자 로그인 뒤에서만 사용)를 통해서만 수행
drop policy if exists "inquiries select via server" on inquiries;
create policy "inquiries select via server"
  on inquiries for select
  using (true);

drop policy if exists "inquiries delete via server" on inquiries;
create policy "inquiries delete via server"
  on inquiries for delete
  using (true);

-- 홈페이지 갤러리 사진 (관리자가 관리, 누구나 조회 가능)
create table if not exists gallery_photos (
  id bigint generated always as identity primary key,
  image_url text not null,
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table gallery_photos enable row level security;

drop policy if exists "gallery photos are publicly readable" on gallery_photos;
create policy "gallery photos are publicly readable"
  on gallery_photos for select
  using (true);

drop policy if exists "gallery photos insert via server" on gallery_photos;
create policy "gallery photos insert via server"
  on gallery_photos for insert
  with check (true);

drop policy if exists "gallery photos delete via server" on gallery_photos;
create policy "gallery photos delete via server"
  on gallery_photos for delete
  using (true);

-- ============================================================
-- 객실/갤러리 사진 업로드 (Storage)
-- 아래 SQL을 실행하기 전에, 대시보드 > Storage 에서
-- 이름이 정확히 "site-photos" 인 버킷을 만들고 Public 으로 설정해주세요.
-- ============================================================
drop policy if exists "site photos insert via server" on storage.objects;
create policy "site photos insert via server"
  on storage.objects for insert
  with check (bucket_id = 'site-photos');

drop policy if exists "site photos update via server" on storage.objects;
create policy "site photos update via server"
  on storage.objects for update
  using (bucket_id = 'site-photos')
  with check (bucket_id = 'site-photos');

drop policy if exists "site photos delete via server" on storage.objects;
create policy "site photos delete via server"
  on storage.objects for delete
  using (bucket_id = 'site-photos');

-- 홈페이지 "요금 안내" 표 (시즌별 요금은 room 테이블에 없는 별도 항목이라 전용 테이블로 관리)
create table if not exists price_table_rows (
  id bigint generated always as identity primary key,
  room_name text not null,
  capacity_base integer,
  capacity_max integer,
  off_weekday integer,
  off_weekend integer,
  peak_weekday integer,
  peak_weekend integer,
  superpeak_weekday integer,
  superpeak_weekend integer,
  sort_order integer not null default 0
);

alter table price_table_rows enable row level security;

drop policy if exists "price table publicly readable" on price_table_rows;
create policy "price table publicly readable"
  on price_table_rows for select
  using (true);

drop policy if exists "price table insert via server" on price_table_rows;
create policy "price table insert via server"
  on price_table_rows for insert
  with check (true);

drop policy if exists "price table update via server" on price_table_rows;
create policy "price table update via server"
  on price_table_rows for update
  using (true) with check (true);

drop policy if exists "price table delete via server" on price_table_rows;
create policy "price table delete via server"
  on price_table_rows for delete
  using (true);

-- 기존 홈페이지에 있던 값 그대로 초기 등록 (이미 데이터가 있으면 건너뜀)
insert into price_table_rows
  (room_name, capacity_base, capacity_max, off_weekday, off_weekend, peak_weekday, peak_weekend, superpeak_weekday, superpeak_weekend, sort_order)
select * from (values
  ('금성', 2, 4, 80000, 100000, 120000, 130000, 150000, 150000, 1),
  ('목성', 2, 4, 100000, 110000, 120000, 130000, 150000, 150000, 2),
  ('은하수', 6, 8, 160000, 200000, 300000, 300000, 350000, 350000, 3),
  ('오리온', 6, 8, 150000, 160000, 200000, 250000, 300000, 300000, 4),
  ('시리우스', 5, 7, 150000, 160000, 200000, 250000, 300000, 300000, 5),
  ('베텔게우스', 6, 8, 150000, 160000, 200000, 250000, 300000, 300000, 6),
  ('평상', 8, 10, 60000, 60000, 80000, 80000, 100000, 100000, 7)
) as seed(room_name, capacity_base, capacity_max, off_weekday, off_weekend, peak_weekday, peak_weekend, superpeak_weekday, superpeak_weekend, sort_order)
where not exists (select 1 from price_table_rows);

-- 짧은 텍스트 설정값 저장용 (예: 요금 안내 표 하단 입/퇴실 안내 문구)
create table if not exists site_settings (
  key text primary key,
  value text
);

alter table site_settings enable row level security;

drop policy if exists "site settings publicly readable" on site_settings;
create policy "site settings publicly readable"
  on site_settings for select
  using (true);

drop policy if exists "site settings insert via server" on site_settings;
create policy "site settings insert via server"
  on site_settings for insert
  with check (true);

drop policy if exists "site settings update via server" on site_settings;
create policy "site settings update via server"
  on site_settings for update
  using (true) with check (true);

insert into site_settings (key, value)
values ('price_table_note', '※ 입실 15:00 / 퇴실 11:00, 인원 추가 시 1인당 추가요금이 발생합니다. 정확한 예약 가능 여부는 전화로 문의해 주세요.')
on conflict (key) do nothing;

insert into site_settings (key, value)
values ('deposit_notice', '예약 확정을 위해 계약금 입금이 필요합니다. 입금 계좌와 금액은 전화(010-4056-5304)로 문의해 주세요.')
on conflict (key) do nothing;
