-- Sikayet ve moderasyon (App Store 1.2): sikayet, zamaninda inceleme, engelleme, ifade filtresi, kurallar.

-- Bir kisinin bir icerik icin acik tek sikayeti olur. snapshot: sikayet anindaki icerik; icerik kaldirilsa da
-- karar ve itiraz icin saklanir.
create table reports (
    id             uuid primary key,
    reporter_id    uuid         not null references users (id) on delete cascade,
    target_type    varchar(10)  not null,
    target_id      varchar(64)  not null,
    target_user_id uuid references users (id) on delete set null,
    reason         varchar(16)  not null,
    note           varchar(500),
    snapshot       varchar(4000),
    status         varchar(10)  not null default 'OPEN',
    resolved_by    uuid references users (id) on delete set null,
    resolved_at    timestamptz,
    created_at     timestamptz  not null default now(),
    constraint ck_reports_type check (target_type in ('POST', 'MESSAGE', 'PROFILE', 'GUESTBOOK')),
    constraint ck_reports_reason check (reason in ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL', 'VIOLENCE', 'SELF_HARM',
                                                   'IMPERSONATION', 'ILLEGAL', 'OTHER')),
    constraint ck_reports_status check (status in ('OPEN', 'REMOVED', 'DISMISSED'))
);
create unique index uq_reports_open_per_reporter on reports (reporter_id, target_type, target_id) where status = 'OPEN';
create index ix_reports_open on reports (target_type, target_id) where status = 'OPEN';
create index ix_reports_reporter on reports (reporter_id, created_at desc);
create index ix_reports_resolved on reports (resolved_at desc) where status <> 'OPEN';

-- Cok sikayet alan icerik inceleme bitene kadar gizlenir; "uygun" karariyla geri acilir.
create table moderation_holds (
    target_type varchar(10) not null,
    target_id   varchar(64) not null,
    created_at  timestamptz not null default now(),
    primary key (target_type, target_id)
);

alter table posts drop constraint ck_posts_status;
alter table posts add constraint ck_posts_status check (status in ('VISIBLE', 'PENDING', 'HIDDEN'));

alter table users add column suspended_at timestamptz;
alter table users add column suspension_reason varchar(300);
alter table users add column rules_accepted_at timestamptz;
