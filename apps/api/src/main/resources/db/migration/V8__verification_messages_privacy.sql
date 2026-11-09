-- Rol ve dogrulamalar. Admin rolu her giriste FOLYO_ADMIN_EMAILS listesinden belirlenir.
alter table users add column role varchar(10) not null default 'USER';
alter table users add constraint ck_users_role check (role in ('USER', 'ADMIN'));
alter table users add column email_verified_at timestamptz;
alter table users add column phone varchar(20);
alter table users add column phone_verified_at timestamptz;
-- Bir telefon yalniz bir hesapta dogrulanabilir: tek numarayla cok hesap acip mesaj yagdirilamaz.
create unique index uq_users_verified_phone on users (phone) where phone_verified_at is not null;

-- Tek kullanimlik dogrulama kodlari. Kodun kendisi degil, ozeti saklanir.
create table verification_codes (
    id          uuid primary key,
    user_id     uuid         not null references users (id) on delete cascade,
    channel     varchar(10)  not null,
    target      varchar(320) not null,
    code_hash   varchar(64)  not null,
    attempts    int          not null default 0,
    expires_at  timestamptz  not null,
    consumed_at timestamptz,
    created_at  timestamptz  not null default now(),
    constraint ck_verification_channel check (channel in ('EMAIL', 'PHONE'))
);
create index ix_verification_codes_user on verification_codes (user_id, channel, created_at desc);

-- Gizlilik: kim gorebilir (profil ve bolumler) ve kim yazabilir (defter ve ozel mesaj).
alter table profiles add column profile_audience varchar(10) not null default 'EVERYONE';
alter table profiles add column location_audience varchar(10) not null default 'EVERYONE';
alter table profiles add column local_time_audience varchar(10) not null default 'EVERYONE';
alter table profiles add column activity_audience varchar(10) not null default 'EVERYONE';
alter table profiles add column guestbook_audience varchar(10) not null default 'EVERYONE';
alter table profiles add column comment_policy varchar(10) not null default 'VERIFIED';
alter table profiles add column message_policy varchar(10) not null default 'VERIFIED';
alter table profiles add constraint ck_profiles_audiences check (
    profile_audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME')
    and location_audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME')
    and local_time_audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME')
    and activity_audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME')
    and guestbook_audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED', 'ONLY_ME'));
alter table profiles add constraint ck_profiles_policies check (
    comment_policy in ('VERIFIED', 'APPROVAL', 'NOBODY') and message_policy in ('VERIFIED', 'APPROVAL', 'NOBODY'));

-- Kart bazinda kitle. Gizli kart (is_visible=false) zaten yalniz sahibine gorunur.
alter table cards add column audience varchar(10) not null default 'EVERYONE';
alter table cards add constraint ck_cards_audience check (audience in ('EVERYONE', 'SIGNED_IN', 'VERIFIED'));

-- "Onayimdan sonra gorunsun" secenegi icin onay bekleyen defter mesajlari.
alter table guestbook_entries drop constraint ck_guestbook_status;
alter table guestbook_entries add constraint ck_guestbook_status check (status in ('VISIBLE', 'HIDDEN', 'PENDING'));

-- Iletisim kutusu: sayfa sahibine ozel mesaj. Yanit yok; gonderenin e-posta/telefonu sahibine gosterilmez.
create table messages (
    id             uuid primary key,
    profile_id     uuid          not null references profiles (id) on delete cascade,
    sender_user_id uuid          not null references users (id) on delete cascade,
    body           varchar(2000) not null,
    folder         varchar(10)   not null,
    read_at        timestamptz,
    created_at     timestamptz   not null default now(),
    constraint ck_messages_folder check (folder in ('INBOX', 'REQUESTS', 'ARCHIVE'))
);
create index ix_messages_profile_folder on messages (profile_id, folder, created_at desc);
create index ix_messages_sender on messages (sender_user_id, created_at desc);

-- Sahibin engelledigi kisi ona mesaj ve defter yazisi gonderemez.
create table user_blocks (
    owner_user_id   uuid        not null references users (id) on delete cascade,
    blocked_user_id uuid        not null references users (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (owner_user_id, blocked_user_id)
);

-- Admin panelinden yonetilen platform ayarlari (entegrasyonlar ve kurallar). Gizli alanlar sifreli saklanir.
create table platform_settings (
    key        varchar(40) primary key,
    value      jsonb       not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references users (id) on delete set null
);

alter table notification_settings add column messages boolean not null default true;
