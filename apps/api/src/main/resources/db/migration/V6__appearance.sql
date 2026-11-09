-- Sayfa gorunumu: kullanici bir tema sablonu ve istege bagli bir vurgu rengi secer.
alter table profiles add column theme varchar(20) not null default 'CLASSIC';
alter table profiles add column accent varchar(20);
alter table profiles add constraint ck_profiles_theme
    check (theme in ('CLASSIC', 'FRIENDLY', 'CORPORATE', 'MINIMAL', 'NIGHT', 'EDITORIAL'));
alter table profiles add constraint ck_profiles_accent
    check (accent is null or accent in ('PURPLE', 'BLUE', 'GREEN', 'ORANGE', 'PINK', 'MONO'));
