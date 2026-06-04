const DocxBuilder = {

  _getRunText(run) {
    const ts = run.getElementsByTagNameNS(NS, 't');
    return Array.from(ts).map(t => t.textContent).join('');
  },

  _getParagraphText(p) {
    const runs = p.getElementsByTagNameNS(NS, 'r');
    return Array.from(runs).map(r => this._getRunText(r)).join('');
  },

  _replaceInParagraph(p, mapping) {
    const fullText = this._getParagraphText(p);
    let newText = fullText;
    let hasChanges = false;

    for (const [key, val] of Object.entries(mapping)) {
      if (newText.includes(key)) {
        newText = newText.replaceAll(key, val);
        hasChanges = true;
      }
    }

    if (!hasChanges) return;

    const runs = Array.from(p.getElementsByTagNameNS(NS, 'r'));

    for (const r of runs) {
      const ts = r.getElementsByTagNameNS(NS, 't');
      for (const t of Array.from(ts)) {
        t.textContent = '';
      }
    }

    if (runs.length > 0) {
      const firstT = runs[0].getElementsByTagNameNS(NS, 't');
      if (firstT.length > 0) {
        firstT[0].textContent = newText;
      } else {
        const tEl = p.ownerDocument.createElementNS(NS, 't');
        tEl.textContent = newText;
        runs[0].appendChild(tEl);
      }
    }
  },

  _replaceInCell(cell, mapping) {
    const ps = cell.getElementsByTagNameNS(NS, 'p');
    for (const p of Array.from(ps)) {
      this._replaceInParagraph(p, mapping);
    }
  },

  _replaceInTable(table, mapping) {
    const cells = table.getElementsByTagNameNS(NS, 'tc');
    for (const cell of Array.from(cells)) {
      this._replaceInCell(cell, mapping);
    }
  },

  _replaceAllInDoc(xmlDoc, mapping) {
    const body = xmlDoc.getElementsByTagNameNS(NS, 'body')[0];
    if (!body) return;

    const tables = body.getElementsByTagNameNS(NS, 'tbl');
    for (const table of Array.from(tables)) {
      this._replaceInTable(table, mapping);
    }

    const ps = body.getElementsByTagNameNS(NS, 'p');
    for (const p of Array.from(ps)) {
      if (!this._isInsideTable(p)) {
        this._replaceInParagraph(p, mapping);
      }
    }
  },

  _isInsideTable(el) {
    let cur = el.parentNode;
    while (cur) {
      if (cur.localName === 'tbl') return true;
      cur = cur.parentNode;
    }
    return false;
  },

  _cloneZip(zip) {
    const newZip = new JSZip();
    zip.forEach((path, file) => {
      newZip.file(path, file.async('uint8array'), { binary: true });
    });
    return newZip;
  },

  async generateDoc(templateZip, mapping) {
    const data = await templateZip.generateAsync({ type: 'uint8array' });
    const zip = await JSZip.loadAsync(data);

    const docEntry = zip.file('word/document.xml');
    if (!docEntry) throw new Error('word/document.xml not found');

    const xmlText = await docEntry.async('string');
    const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');

    this._replaceAllInDoc(xmlDoc, mapping);

    const serializer = new XMLSerializer();
    const newXml = serializer.serializeToString(xmlDoc);
    zip.file('word/document.xml', newXml);

    return zip;
  },

  async generateAndDownload(templateZip, mapping, filename) {
    const zip = await this.generateDoc(templateZip, mapping);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, filename);
  }
};
