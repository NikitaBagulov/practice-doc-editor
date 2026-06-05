const DocxBuilder = {

  _getRunText(run) {
    const ts = run.getElementsByTagNameNS(NS, 't');
    return Array.from(ts).map(t => t.textContent).join('');
  },

  _getParagraphText(p) {
    const runs = p.getElementsByTagNameNS(NS, 'r');
    return Array.from(runs).map(r => this._getRunText(r)).join('');
  },

  _isFioKey(key) {
    return key.includes('_FIO');
  },

  _removeChildrenByLocalName(el, localName) {
    for (const child of Array.from(el.childNodes)) {
      if (child.localName === localName) {
        el.removeChild(child);
      }
    }
  },

  _styleFioRun(run) {
    let rPr = Array.from(run.childNodes).find(node => node.localName === 'rPr');
    if (!rPr) {
      rPr = run.ownerDocument.createElementNS(NS, 'rPr');
      run.insertBefore(rPr, run.firstChild);
    }

    this._removeChildrenByLocalName(rPr, 'b');
    this._removeChildrenByLocalName(rPr, 'bCs');
    this._removeChildrenByLocalName(rPr, 'u');

    const underline = run.ownerDocument.createElementNS(NS, 'u');
    underline.setAttributeNS(NS, 'w:val', 'single');
    rPr.appendChild(underline);
  },

  _replaceParagraphWithSegments(p, segments) {
    const oldRuns = Array.from(p.getElementsByTagNameNS(NS, 'r'));
    const baseRun = oldRuns[0] || p.ownerDocument.createElementNS(NS, 'r');

    for (const run of oldRuns) {
      if (run.parentNode === p) {
        p.removeChild(run);
      }
    }

    for (const segment of segments) {
      if (!segment.text) continue;

      const run = baseRun.cloneNode(true);
      for (const child of Array.from(run.childNodes)) {
        if (child.localName !== 'rPr') {
          run.removeChild(child);
        }
      }

      if (segment.isFio) {
        this._styleFioRun(run);
      }

      const textEl = p.ownerDocument.createElementNS(NS, 't');
      textEl.textContent = segment.text;
      if (/^\s|\s$/.test(segment.text)) {
        textEl.setAttribute('xml:space', 'preserve');
      }
      run.appendChild(textEl);
      p.appendChild(run);
    }
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
    let segments = [{ text: fullText, isFio: false }];
    let hasChanges = false;

    for (const [key, val] of Object.entries(mapping)) {
      const nextSegments = [];
      for (const segment of segments) {
        if (segment.isFio || !segment.text.includes(key)) {
          nextSegments.push(segment);
          continue;
        }

        const parts = segment.text.split(key);
        const replacement = this._getContextValue(key, mapping, replacementContext);
        for (let i = 0; i < parts.length; i++) {
          if (parts[i]) {
            nextSegments.push({ text: parts[i], isFio: false });
          }
          if (i < parts.length - 1) {
            nextSegments.push({ text: replacement, isFio: this._isFioKey(key) });
            hasChanges = true;
          }
        }
      }
      segments = nextSegments;
    }

    if (!hasChanges) return;
    this._replaceParagraphWithSegments(p, segments);
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
