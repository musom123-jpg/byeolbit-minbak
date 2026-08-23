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
  memo text,
  created_at timestamptz not null default now()
);

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

-- inquiries: 브라우저에서 누구나 문의를 "남길" 수는 있지만(insert), 남이 남긴 문의를 읽을 수는 없음(select 정책 없음 = 기본 차단)
drop policy if exists "anyone can submit an inquiry" on inquiries;
create policy "anyone can submit an inquiry"
  on inquiries for insert
  with check (true);

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
