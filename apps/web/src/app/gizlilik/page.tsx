import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik",
  description: "folyo hangi verileri neden tutar, ne kadar saklar ve nasıl silebilirsin.",
};

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: "Sayfa sahibinden tuttuklarımız",
    items: [
      "Giriş yaptığın hesabın (Google veya GitHub) kimliği, adın, e-posta adresin ve profil fotoğrafının adresi.",
      "Sayfanda gösterdiğin bilgiler: kullanıcı adı, görünen ad, biyografi, konum, saat dilimi, kartlar ve tema seçimin.",
      "Yüklediğin fotoğraflar. Konum (GPS) dahil tüm fotoğraf bilgileri yüklerken silinir.",
      "Spotify veya Strava'yı bağlarsan erişim izinleri; şifrelenmiş olarak saklanır ve yalnız kartını güncellemek için kullanılır. Strava'da yalnız herkese açık aktivitelerin gösterilir.",
    ],
  },
  {
    title: "Ziyaretçilerden tuttuklarımız",
    items: [
      "Sayfa görüntülenme ve kart tıklama sayıları, gün bazında toplam olarak.",
      "Tekil ziyaretçiyi saymak için IP adresi ve tarayıcı bilgisi o güne özel rastgele bir anahtarla tek yönlü özetlenir; IP adresinin kendisi saklanmaz ve özetler ertesi gün işe yaramaz hale gelir.",
      "Ziyaretçinin tarayıcısı Google, GitHub veya Spotify'a istek atmaz: avatarlar ve albüm kapakları sunucumuz üzerinden gösterilir.",
      "Ziyaretçi defterine mesaj bırakırsan adın, profil fotoğrafın ve mesajın o sayfada herkese açık görünür. Sayfa sahibi mesajı gizleyebilir veya silebilir.",
    ],
  },
  {
    title: "Şikayet ve moderasyon",
    items: [
      "Bir içeriği şikayet ettiğinde seçtiğin neden, açıklaman ve içeriğin o anki kopyası yönetici incelemesi için saklanır. Şikayet edenin kimliği içerik sahibine gösterilmez.",
      "Bir sohbet mesajını şikayet edersen yalnız o mesajın kopyası yöneticiyle paylaşılır; sohbetin geri kalanı paylaşılmaz.",
      "Topluluk kurallarını kabul ettiğin tarih saklanır. Kurallara aykırı içerik kaldırılabilir, hesap askıya alınabilir.",
    ],
  },
  {
    title: "Çerezler",
    items: [
      "Yalnız çalışmak için gereken çerezler: oturum çerezi ve form güvenliği (CSRF) çerezi. Reklam veya takip çerezi kullanılmaz.",
    ],
  },
  {
    title: "Saklama ve silme",
    items: [
      "Aktivite akışındaki kayıtlar en fazla 180 gün tutulur.",
      "Editördeki “Hesabımı sil” düğmesi hesabını, sayfanı, kartlarını, fotoğraflarını, istatistiklerini, bağlı hesaplarını ve başka sayfalara bıraktığın mesajları kalıcı olarak siler. Mobil uygulamada Profil sekmesinden de silebilirsin.",
      "Bağlı bir hesabı kaldırdığında o hesaptan gelen veriler sayfandan hemen kaldırılır.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">
        ← folyo
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Gizlilik</h1>
      <p className="mt-3 text-lg text-ink-2">
        folyo, sayfanı göstermek için gereken en az veriyi tutar. Veri satmaz, reklam göstermez, ziyaretçileri izlemez.
      </p>
      <div className="mt-10 flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 leading-relaxed text-ink-2 marker:text-ink-3">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
