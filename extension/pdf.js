/**
 * WholePage Shot（まるごとスクショ） ― PDFの組み立て
 *
 * 外部のライブラリは使わず、JPEG画像を貼っただけの素直なPDFを自前で書き出す。
 * pages の1件が1ページ。長さの単位はポイント（1インチ＝72ポイント）。
 *   { jpeg: Uint8Array, pxW, pxH, pageW, pageH, drawX, drawY, drawW, drawH }
 */
(() => {
  const enc = new TextEncoder();

  function build(pages) {
    const chunks = [];
    let length = 0;
    const push = (data) => {
      const u8 = typeof data === 'string' ? enc.encode(data) : data;
      chunks.push(u8);
      length += u8.length;
    };

    // 1番＝目次、2番＝ページの束、3番以降は1ページにつき3つ（ページ・中身・画像）
    const offsets = {};
    const pageIds = pages.map((_, i) => 3 + i * 3);
    const total = 2 + pages.length * 3;

    const startObj = (id) => { offsets[id] = length; };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    startObj(1);
    push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    startObj(2);
    push('2 0 obj\n<< /Type /Pages /Count ' + pages.length + ' /Kids [' +
         pageIds.map((id) => id + ' 0 R').join(' ') + '] >>\nendobj\n');

    pages.forEach((p, i) => {
      const pageId = 3 + i * 3;
      const contentId = pageId + 1;
      const imageId = pageId + 2;

      startObj(pageId);
      push('' + pageId + ' 0 obj\n<< /Type /Page /Parent 2 0 R ' +
           '/MediaBox [0 0 ' + n(p.pageW) + ' ' + n(p.pageH) + '] ' +
           '/Resources << /XObject << /Im0 ' + imageId + ' 0 R >> /ProcSet [/PDF /ImageC] >> ' +
           '/Contents ' + contentId + ' 0 R >>\nendobj\n');

      const stream = 'q\n' + n(p.drawW) + ' 0 0 ' + n(p.drawH) + ' ' + n(p.drawX) + ' ' + n(p.drawY) + ' cm\n/Im0 Do\nQ\n';
      const streamBytes = enc.encode(stream);
      startObj(contentId);
      push('' + contentId + ' 0 obj\n<< /Length ' + streamBytes.length + ' >>\nstream\n');
      push(streamBytes);
      push('endstream\nendobj\n');

      startObj(imageId);
      push('' + imageId + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.pxW +
           ' /Height ' + p.pxH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
           '/Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
      push(p.jpeg);
      push('\nendstream\nendobj\n');
    });

    const xrefAt = length;
    let xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (let id = 1; id <= total; id++) {
      xref += String(offsets[id] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');

    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return new Blob([out], { type: 'application/pdf' });
  }

  const n = (v) => (Math.round(v * 1000) / 1000).toString();

  window.WholePagePdf = { build };
})();
