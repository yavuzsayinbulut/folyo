-- Medya: dosyanin kendisi depoda (yerel disk ya da S3 uyumlu), kaydi burada. Orijinal kalite korunur
-- (metadata kayipsiz temizlenir); hizli gosterim icin kucuk kopyalar "variants" icinde.
create table media_assets (
    id            uuid primary key,
    owner_user_id uuid         not null references users (id) on delete cascade,
    kind          varchar(10)  not null,
    store         varchar(10)  not null,
    content_type  varchar(40)  not null,
    byte_size     bigint       not null,
    width         int,
    height        int,
    duration_ms   int,
    storage_key   varchar(200) not null,
    variants      jsonb        not null default '{}',
    sha256        char(64)     not null,
    -- Gonderiye/sohbete baglaninca dolar; baglanmamis yuklemeler bir gun sonra temizlenir.
    attached_at   timestamptz,
    created_at    timestamptz  not null default now(),
    constraint ck_media_assets_kind check (kind in ('PHOTO', 'VIDEO', 'AVATAR', 'STICKER')),
    constraint ck_media_assets_store check (store in ('LOCAL', 'S3'))
);
create index ix_media_assets_owner on media_assets (owner_user_id, kind, created_at desc);
create index ix_media_assets_unattached on media_assets (created_at) where attached_at is null and kind in ('PHOTO', 'VIDEO');

alter table users add column avatar_asset_id uuid references media_assets (id) on delete set null;

-- Galeri fotograflari da artik orijinal kalitede saklanir; kartta hizli acilan kopya ayrica tutulur.
alter table media add column original_key varchar(200);

-- Gonderiler (tweet benzeri). Yanitlar ayni tabloda; sayaclar satirda tutulur, akislar kismi indeksle okunur.
create table posts (
    id             uuid primary key,
    author_user_id uuid        not null references users (id) on delete cascade,
    profile_id     uuid        not null references profiles (id) on delete cascade,
    reply_to_id    uuid references posts (id) on delete cascade,
    body           varchar(500),
    audience       varchar(10) not null default 'EVERYONE',
    status         varchar(10) not null default 'VISIBLE',
    like_count     int         not null default 0,
    reply_count    int         not null default 0,
    created_at     timestamptz not null default now(),
    constraint ck_posts_audience check (audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME')),
    constraint ck_posts_status check (status in ('VISIBLE', 'PENDING')),
    constraint ck_posts_counts check (like_count >= 0 and reply_count >= 0)
);
-- Profil akisi ve Kesfet: en yeniden eskiye, (created_at, id) imleciyle sayfalanir.
create index ix_posts_profile_timeline on posts (profile_id, created_at desc, id desc) where reply_to_id is null;
create index ix_posts_explore on posts (created_at desc, id desc) where reply_to_id is null and status = 'VISIBLE';
create index ix_posts_replies on posts (reply_to_id, created_at, id) where reply_to_id is not null;
create index ix_posts_author on posts (author_user_id, created_at desc);

create table post_media (
    post_id  uuid     not null references posts (id) on delete cascade,
    position smallint not null,
    asset_id uuid     not null references media_assets (id) on delete cascade,
    primary key (post_id, position),
    constraint uq_post_media_asset unique (asset_id)
);

create table post_likes (
    post_id    uuid        not null references posts (id) on delete cascade,
    user_id    uuid        not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);
create index ix_post_likes_user on post_likes (user_id, created_at desc);

-- Sohbet (WhatsApp benzeri, iki kisilik). Her sohbetin mesajlari 1'den baslayan sira numarasi alir;
-- "iletildi" ve "okundu" tikleri mesaj basina degil, uye basina tek bir sira numarasiyla tutulur.
create table conversations (
    id              uuid primary key,
    user_low        uuid        not null references users (id) on delete cascade,
    user_high       uuid        not null references users (id) on delete cascade,
    started_by      uuid        not null references users (id) on delete cascade,
    last_seq        bigint      not null default 0,
    last_message_at timestamptz,
    created_at      timestamptz not null default now(),
    constraint uq_conversations_pair unique (user_low, user_high),
    constraint ck_conversations_order check (user_low < user_high)
);

create table conversation_members (
    conversation_id uuid        not null references conversations (id) on delete cascade,
    user_id         uuid        not null references users (id) on delete cascade,
    state           varchar(10) not null default 'ACTIVE',
    delivered_seq   bigint      not null default 0,
    read_seq        bigint      not null default 0,
    primary key (conversation_id, user_id),
    constraint ck_conversation_members_state check (state in ('ACTIVE', 'REQUEST', 'ARCHIVED'))
);
create index ix_conversation_members_user on conversation_members (user_id, state);

create table chat_messages (
    id              bigint generated always as identity primary key,
    conversation_id uuid          not null references conversations (id) on delete cascade,
    seq             bigint        not null,
    sender_user_id  uuid          not null references users (id) on delete cascade,
    kind            varchar(10)   not null,
    body            varchar(4000),
    asset_id        uuid references media_assets (id) on delete set null,
    sticker         varchar(80),
    client_id       varchar(64),
    created_at      timestamptz   not null default now(),
    deleted_at      timestamptz,
    constraint uq_chat_messages_seq unique (conversation_id, seq),
    constraint uq_chat_messages_client unique (sender_user_id, client_id),
    constraint ck_chat_messages_kind check (kind in ('TEXT', 'PHOTO', 'VIDEO', 'STICKER'))
);
create index ix_chat_messages_asset on chat_messages (asset_id) where asset_id is not null;

-- Cevrimici / son gorulme ve okundu bilgisi gizliligi (WhatsApp gibi: kapatan, baskasininkini de goremez).
alter table users add column last_seen_at timestamptz;
alter table users add column last_seen_audience varchar(10) not null default 'EVERYONE';
alter table users add column read_receipts boolean not null default true;
alter table users add constraint ck_users_last_seen_audience check (last_seen_audience in ('EVERYONE', 'CHATS', 'NOBODY'));

-- Eski tek yonlu iletisim kutusu mesajlari sohbetlere tasinir.
insert into conversations (id, user_low, user_high, started_by, last_seq, last_message_at, created_at)
select gen_random_uuid(), least(m.sender_user_id, p.user_id), greatest(m.sender_user_id, p.user_id),
       (array_agg(m.sender_user_id order by m.created_at))[1], count(*), max(m.created_at), min(m.created_at)
from messages m join profiles p on p.id = m.profile_id
where m.sender_user_id <> p.user_id
group by least(m.sender_user_id, p.user_id), greatest(m.sender_user_id, p.user_id);

insert into chat_messages (conversation_id, seq, sender_user_id, kind, body, created_at)
select c.id, row_number() over (partition by c.id order by m.created_at, m.id), m.sender_user_id, 'TEXT', m.body, m.created_at
from messages m join profiles p on p.id = m.profile_id
join conversations c on c.user_low = least(m.sender_user_id, p.user_id) and c.user_high = greatest(m.sender_user_id, p.user_id);

-- Gonderen: kendi mesajlarini gormus sayilir. Sayfa sahibi: klasor ve okunma durumu korunur.
insert into conversation_members (conversation_id, user_id, state, delivered_seq, read_seq)
select c.id, c.started_by, 'ACTIVE', c.last_seq, c.last_seq from conversations c;

insert into conversation_members (conversation_id, user_id, state, delivered_seq, read_seq)
select c.id, case when c.started_by = c.user_low then c.user_high else c.user_low end,
       case (select m.folder from messages m join profiles p on p.id = m.profile_id
             where least(m.sender_user_id, p.user_id) = c.user_low and greatest(m.sender_user_id, p.user_id) = c.user_high
             order by m.created_at desc limit 1)
           when 'REQUESTS' then 'REQUEST' when 'ARCHIVE' then 'ARCHIVED' else 'ACTIVE' end,
       c.last_seq,
       coalesce((select max(cm.seq) from chat_messages cm
                 join messages m on m.sender_user_id = cm.sender_user_id and m.created_at = cm.created_at and m.body = cm.body
                 where cm.conversation_id = c.id and m.read_at is not null), 0)
from conversations c;

drop table messages;
