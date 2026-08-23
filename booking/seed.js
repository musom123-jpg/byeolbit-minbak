// 초기 객실 데이터를 넣는 스크립트입니다.
// 실행: npm run seed
// 실제 운영할 객실 정보로 아래 내용을 수정한 뒤 실행하세요. 이미 객실이 등록되어 있으면 건너뜁니다.

const supabase = require('./supabaseClient');

// 가격은 비수기 주중 기준 최저가입니다. 성수기/주말/극성수기 요금은 이 시스템에서
// 자동으로 반영되지 않으니, 시즌별 요금은 홈페이지 요금표와 전화 확인으로 안내하세요.
const rooms = [
  {
    name: '금성',
    description: '기준 2인 · 최대 4인. 비수기 주중 80,000원부터 (성수기·주말 최대 150,000원).',
    capacity: 4,
    price_per_night: 80000,
    image_url: '/img/room-1.jpg'
  },
  {
    name: '목성',
    description: '기준 2인 · 최대 4인. 비수기 주중 100,000원부터 (성수기·주말 최대 150,000원).',
    capacity: 4,
    price_per_night: 100000,
    image_url: '/img/room-2.jpg'
  },
  {
    name: '은하수',
    description: '기준 6인 · 최대 8인. 비수기 주중 160,000원부터 (성수기·주말 최대 350,000원).',
    capacity: 8,
    price_per_night: 160000,
    image_url: '/img/room-3.jpg'
  },
  {
    name: '오리온',
    description: '기준 6인 · 최대 8인. 비수기 주중 150,000원부터 (성수기·주말 최대 300,000원).',
    capacity: 8,
    price_per_night: 150000,
    image_url: '/img/room-4.jpg'
  },
  {
    name: '시리우스',
    description: '기준 5인 · 최대 7인. 비수기 주중 150,000원부터 (성수기·주말 최대 300,000원).',
    capacity: 7,
    price_per_night: 150000,
    image_url: '/img/room-5.jpg'
  },
  {
    name: '베텔게우스',
    description: '기준 6인 · 최대 8인. 비수기 주중 150,000원부터 (성수기·주말 최대 300,000원).',
    capacity: 8,
    price_per_night: 150000,
    image_url: '/img/room-6.jpg'
  }
];

async function main() {
  const { count, error: countErr } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true });

  if (countErr) {
    console.error('객실 수 확인 중 오류:', countErr);
    process.exit(1);
  }

  if (count > 0) {
    console.log(`이미 객실 ${count}개가 등록되어 있습니다. 시드를 건너뜁니다.`);
    process.exit(0);
  }

  const { error: insertErr } = await supabase.from('rooms').insert(rooms);
  if (insertErr) {
    console.error('객실 등록 중 오류:', insertErr);
    process.exit(1);
  }

  console.log(`객실 ${rooms.length}개를 등록했습니다.`);
}

main();
