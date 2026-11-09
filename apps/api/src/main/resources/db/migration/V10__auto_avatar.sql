-- Otomatik profil gorseli. Gorunen fotograf (avatar_url) artik turetilir:
-- kisinin yukledigi > otomatik (bagli hesaptaki gercek fotograf ya da bagli platformlardan uretilen) > giris hesabinin fotografi.
alter table users add column provider_avatar_url varchar(2048);
update users set provider_avatar_url = avatar_url
where avatar_asset_id is null and avatar_url is not null and avatar_url not like '/api/%';

alter table users add column auto_avatar_asset_id uuid references media_assets (id) on delete set null;
alter table users add column auto_avatar_source varchar(10);
-- Girdilerin (platformlar, bas harfler, foto kaynagi) ozeti: degismediyse gorsel yeniden uretilmez.
alter table users add column auto_avatar_key varchar(64);
-- Gercek fotograf gecici bir hatayla alinamadiysa yeniden denenecegi zaman.
alter table users add column auto_avatar_retry_at timestamptz;
alter table users add constraint ck_users_auto_avatar_source
    check (auto_avatar_source in ('SPOTIFY', 'STRAVA', 'GITHUB', 'GENERATED'));
create index ix_users_auto_avatar_pending on users (auto_avatar_retry_at) where auto_avatar_retry_at is not null;
