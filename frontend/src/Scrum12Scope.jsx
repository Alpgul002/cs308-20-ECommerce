const notes = {
  home: ["1 · Ana sayfa entegrasyonu", "Ürünler, fiyatlar, stoklar ve kategori sayıları API üzerinden SQLite veritabanından gelir. Mevcut ekran tasarımı takımın önceki çalışmalarından korunmuştur."],
  filters: ["2 · Filtreleme entegrasyonu", "Arama, kategori, fiyat aralığı, stok ve sıralama birlikte sunucuya gönderilir. Sonuçları veritabanı seçer; hızlı aramada eski cevap yeni sonucu ezemez."],
  detail: ["3 · Ürün sayfası entegrasyonu", "Bu ekran her açıldığında /api/products/:id çağrısı yapar. Fiyat ve stok yeniden okunur. Yenileme, doğrudan bağlantı, 404 ve bağlantı hataları ele alınır."]
};

export default function Scrum12Scope({ section }) {
  if (new URLSearchParams(window.location.search).get("scrum12") !== "1") return null;
  const [title, description] = notes[section];
  return <aside className="scrum12-scope" aria-label="SCRUM-12 kapsamı">
    <strong>SCRUM-12 / {title}</strong><p>{description}</p>
    <a href="/scrum12.html">Kapsam, dosyalar ve demo adımları →</a>
  </aside>;
}
