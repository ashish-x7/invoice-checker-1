/**
 * Amazon Mail Export - Final Polish with "PROCESSING..." Status
 */
(function () {
    "use strict";

    class SimpleZip {
        constructor() { this.files = []; this.offset = 0; }
        addFile(name, data) {
            const buf = (data instanceof Uint8Array) ? data : new TextEncoder().encode(data);
            const nBuf = new TextEncoder().encode(name);
            const crc = this.crc32(buf);
            const now = new Date();
            const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
            const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
            const header = new Uint8Array(30 + nBuf.length);
            header.set([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, time & 0xFF, time >> 8, date & 0xFF, date >> 8]);
            header.set([crc & 0xFF, (crc >> 8) & 0xFF, (crc >> 16) & 0xFF, (crc >> 24) & 0xFF], 14);
            header.set([buf.length & 0xFF, (buf.length >> 8) & 0xFF, (buf.length >> 16) & 0xFF, (buf.length >> 24) & 0xFF], 18);
            header.set([buf.length & 0xFF, (buf.length >> 8) & 0xFF, (buf.length >> 16) & 0xFF, (buf.length >> 24) & 0xFF], 22);
            header.set([nBuf.length & 0xFF, nBuf.length >> 8, 0, 0], 26);
            header.set(nBuf, 30);
            const cHeader = new Uint8Array(46 + nBuf.length);
            cHeader.set([0x50, 0x4B, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, time & 0xFF, time >> 8, date & 0xFF, date >> 8]);
            cHeader.set([crc & 0xFF, (crc >> 8) & 0xFF, (crc >> 16) & 0xFF, (crc >> 24) & 0xFF], 16);
            cHeader.set([buf.length & 0xFF, (buf.length >> 8) & 0xFF, (buf.length >> 16) & 0xFF, (buf.length >> 24) & 0xFF], 20);
            cHeader.set([buf.length & 0xFF, (buf.length >> 8) & 0xFF, (buf.length >> 16) & 0xFF, (buf.length >> 24) & 0xFF], 24);
            cHeader.set([nBuf.length & 0xFF, nBuf.length >> 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 28);
            cHeader.set([this.offset & 0xFF, (this.offset >> 8) & 0xFF, (this.offset >> 16) & 0xFF, (this.offset >> 24) & 0xFF], 42);
            cHeader.set(nBuf, 46);
            this.files.push({ h: header, d: buf, c: cHeader });
            this.offset += header.length + buf.length;
        }
        crc32(d) {
            let c = 0xFFFFFFFF;
            if (!window._crcT) {
                window._crcT = new Uint32Array(256);
                for (let i = 0; i < 256; i++) {
                    let r = i; for (let k = 0; k < 8; k++) r = (r & 1) ? (0xEDB88320 ^ (r >>> 1)) : (r >>> 1);
                    window._crcT[i] = r;
                }
            }
            for (let i = 0; i < d.length; i++) c = (c >>> 8) ^ window._crcT[(c ^ d[i]) & 0xFF];
            return (c ^ 0xFFFFFFFF) >>> 0;
        }
        build() {
            if (this.files.length === 0) return null;
            let cSize = 0; this.files.forEach(f => cSize += f.c.length);
            const eocd = new Uint8Array(22);
            eocd.set([0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0, this.files.length & 0xFF, this.files.length >> 8, this.files.length & 0xFF, this.files.length >> 8, cSize & 0xFF, (cSize >> 8) & 0xFF, (cSize >> 16) & 0xFF, (cSize >> 24) & 0xFF, this.offset & 0xFF, (this.offset >> 8) & 0xFF, (this.offset >> 16) & 0xFF, (this.offset >> 24) & 0xFF, 0, 0]);
            const res = new Uint8Array(this.offset + cSize + 22);
            let cur = 0;
            this.files.forEach(f => { res.set(f.h, cur); cur += f.h.length; res.set(f.d, cur); cur += f.d.length; });
            this.files.forEach(f => { res.set(f.c, cur); cur += f.c.length; });
            res.set(eocd, cur);
            return new Blob([res], { type: "application/zip" });
        }
    }

    async function exportMailArchive() {
        const btn = document.getElementById('mailExportBtn');
        const rows = document.querySelectorAll('#savedLinksBody tr');
        if (rows.length === 0) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = "PROCESSING..."; // Status Update
        btn.disabled = true;

        try {
            const zip = new SimpleZip();
            const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
            let nickName = (document.body.innerText.match(/([A-Z0-9]+)\s*👋/i)?.[1] || "ASHISH").toUpperCase();

            const buckets = { 'CB': [], 'KT': [], 'ET': [], 'RZ': [], 'OTHERS': [] };
            const folderMap = { 'CB': 'COCOBLU/', 'KT': 'CLICKTECH/', 'ET': 'ETRADE/', 'RZ': 'RETAILZED/', 'OTHERS': 'OTHERS/' };

            let count = 0;
            for (const row of rows) {
                const fullText = row.cells[0].innerText.trim();
                const shortInv = fullText.split(" ")[0];
                const linkBtn = row.querySelector('[data-link], .download-pdf-btn, a[href*="pdf"]');
                const linkUrl = linkBtn?.getAttribute('data-link') || linkBtn?.getAttribute('href');

                if (linkUrl && fullText) {
                    const prefix = shortInv.substring(0, 2).toUpperCase();
                    try {
                        const resp = await fetch(linkUrl);
                        if (resp.ok) {
                            const ab = await resp.arrayBuffer();
                            const bucketKey = buckets[prefix] ? prefix : 'OTHERS';
                            zip.addFile(folderMap[bucketKey] + fullText + ".pdf", new Uint8Array(ab));
                            buckets[bucketKey].push(shortInv);
                            count++;
                        }
                    } catch (e) { }
                }
            }

            // EXCEL GENERATION
            const aoa = [
                ["DATE", "", "", ""],
                [dateStr, "", nickName, ""],
                ["COCOBLU (CB)", "CLICKTECH (KT)", "ETRADE (ET)", "RETAILEZ (RZ)"]
            ];

            const maxLen = Math.max(buckets['CB'].length, buckets['KT'].length, buckets['ET'].length, buckets['RZ'].length);
            for (let i = 0; i < maxLen; i++) {
                aoa.push([buckets['CB'][i] || "", buckets['KT'][i] || "", buckets['ET'][i] || "", buckets['RZ'][i] || ""]);
            }

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 35 }, { wch: 35 }, { wch: 35 }, { wch: 35 }];
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }, { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } }];

            XLSX.utils.book_append_sheet(wb, ws, "SUMMARY");
            const exData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            zip.addFile(nickName + ".xlsx", new Uint8Array(exData));

            const blob = zip.build();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${dateStr} ${nickName}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            btn.innerHTML = "DONE!";
            setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 3000);

        } catch (err) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    const oldBtn = document.getElementById('mailExportBtn');
    if (oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.addEventListener('click', exportMailArchive);
    }
})();
