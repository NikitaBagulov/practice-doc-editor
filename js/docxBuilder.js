const DocxBuilder = {

  _getRunText(run) {
    const ts = run.getElementsByTagNameNS(NS, 't');
    return Array.from(ts).map(t => t.textContent).join('');
  },

  _getParagraphText(p) {
    const runs = p.getElementsByTagNameNS(NS, 'r');
    return Array.from(runs).map(r => this._getRunText(r)).join('');
  },

  _getContextValue(key, mapping, contextText) {
    const text = contextText.toLowerCase();

    if (key === '{{STUDENT_FIO}}') {
      if (text.includes('студенту') || text.includes('магистранту')) {
        return mapping['{{STUDENT_FIO_DATIVE}}'] || mapping[key];
      }
      if (text.includes('студента') || text.includes('магистранта')) {
        return mapping['{{STUDENT_FIO_GENITIVE}}'] || mapping[key];
      }
    }

    if (key === '{{SUPERVISOR_FIO}}') {
      if (text.includes('руководителю')) {
        return mapping['{{SUPERVISOR_FIO_DATIVE}}'] || mapping[key];
      }
      if (text.includes('руководителя')) {
        return mapping['{{SUPERVISOR_FIO_GENITIVE}}'] || mapping[key];
      }
    }

    return mapping[key];
  },

  _replaceInParagraph(p, mapping, contextText = null) {
    const fullText = this._getParagraphText(p);
    const replacementContext = contextText || fullText;
    let newText = fullText;
    let hasChanges = false;

    for (const [key, val] of Object.entries(mapping)) {
      if (newText.includes(key)) {
        newText = newText.replaceAll(key, this._getContextValue(key, mapping, replacementContext));
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
    const cellText = Array.from(ps).map(p => this._getParagraphText(p)).join(' ');
    for (const p of Array.from(ps)) {
      this._replaceInParagraph(p, mapping, cellText);
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

    const ps = Array.from(body.getElementsByTagNameNS(NS, 'p'));
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!this._isInsideTable(p)) {
        const context = ps.slice(Math.max(0, i - 2), i + 4)
          .map(item => this._getParagraphText(item))
          .join(' ');
        this._replaceInParagraph(p, mapping, context);
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
