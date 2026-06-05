const TemplateLoader = {

  async loadFile(file) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    return zip;
  },

  getXmlText(zip, path = 'word/document.xml') {
    return zip.file(path).async('string');
  },

  parseXml(text) {
    return new DOMParser().parseFromString(text, 'text/xml');
  },

  serializeXml(doc) {
    return new XMLSerializer().serializeToString(doc);
  },

  getCellText(cell) {
    const ts = cell.getElementsByTagNameNS(NS, 't');
    return Array.from(ts).map(t => t.textContent).join('');
  },

  norm(s) {
    return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  },

  findColumnByHeader(table, headerText) {
    const rows = table.getElementsByTagNameNS(NS, 'tr');
    if (!rows.length) return -1;
    const headerRow = rows[0];
    const cells = headerRow.getElementsByTagNameNS(NS, 'tc');
    const want = this.norm(headerText);
    for (let i = 0; i < cells.length; i++) {
      if (this.norm(this.getCellText(cells[i])).includes(want)) {
        return i;
      }
    }
    return -1;
  },

  extractScoreKeys(text) {
    const re = /\{\{SCORE(?:_(\d+))?\}\}/g;
    const keys = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      keys.push(m[0]);
    }
    return keys;
  },

  getRowText(row) {
    const cells = row.getElementsByTagNameNS(NS, 'tc');
    return Array.from(cells).map(c => this.getCellText(c)).join(' ');
  },

  extractDashItems(text) {
    const items = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^[-\u00ad]\s*/.test(trimmed)) {
        items.push(trimmed.replace(/^\u00ad\s*-?\s*/, '- '));
      }
    }
    return items;
  },

  extractDashItemsFromRow(row) {
    const cells = row.getElementsByTagNameNS(NS, 'tc');
    const items = [];
    for (const cell of cells) {
      items.push(...this.extractDashItems(this.getCellText(cell)));
    }
    return items;
  },

  detectStage(text) {
    const j = this.norm(text);
    if (j.includes('подготовительный')) return 'P';
    if (j.includes('основной')) return 'O';
    if (j.includes('заключительный')) return 'Z';
    return null;
  },

  isNotScored(text) {
    return this.norm(text).includes('не оценивается');
  },

  async loadEvalStructure(file) {
    const zip = await this.loadFile(file);
    const xmlText = await this.getXmlText(zip);
    const xmlDoc = this.parseXml(xmlText);

    const tables = xmlDoc.getElementsByTagNameNS(NS, 'tbl');
    if (!tables.length) throw new Error('В оценочном листе нет таблиц');

    const table = tables[0];
    const scoreCol = this.findColumnByHeader(table, 'Балл');
    if (scoreCol < 0) throw new Error('Не найдена колонка "Балл" в оценочном листе');

    const criteriaCol = this.findColumnByHeader(table, 'Критери');

    const rows = table.getElementsByTagNameNS(NS, 'tr');
    const scoreItems = [];
    let currentStage = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowText = this.getRowText(row);

      const stage = this.detectStage(rowText);
      if (stage) {
        currentStage = stage;
        continue;
      }

      if (this.isNotScored(rowText)) continue;

      const dashItems = this.extractDashItemsFromRow(row);
      if (!dashItems.length) continue;

      const cells = row.getElementsByTagNameNS(NS, 'tc');
      if (scoreCol >= cells.length) continue;

      const scoreCell = cells[scoreCol];
      const scoreCellText = this.getCellText(scoreCell);
      const scoreKeys = this.extractScoreKeys(scoreCellText);
      if (!scoreKeys.length) continue;

      const labelText = dashItems[0];
      const rowKey = this.norm(labelText);

      let criteriaText = '';
      if (criteriaCol >= 0 && criteriaCol < cells.length) {
        criteriaText = this.getCellText(cells[criteriaCol]);
      }

      scoreItems.push({
        rowKey,
        label: labelText.replace(/^- /, '').trim(),
        stage: currentStage || '?',
        scoreKeys,
        originalText: scoreCellText,
        criteriaText
      });
    }

    return { items: scoreItems, table, xmlDoc, zip, scoreCol };
  },

  async loadCompStructure(file) {
    const zip = await this.loadFile(file);
    const xmlText = await this.getXmlText(zip);
    const xmlDoc = this.parseXml(xmlText);

    const tables = xmlDoc.getElementsByTagNameNS(NS, 'tbl');
    if (!tables.length) throw new Error('В листе компетенций нет таблиц');

    const table = tables[0];
    const scoreCol = this.findColumnByHeader(table, 'Балл');
    if (scoreCol < 0) throw new Error('Не найдена колонка "Балл" в листе компетенций');

    const rows = table.getElementsByTagNameNS(NS, 'tr');
    const compRows = [];
    let currentComp = null;
    const compCodeRe = /^(УК|ОПК|ПКА)-\d+/;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowText = this.getRowText(row);
      const joined = this.norm(rowText);

      if (joined.includes('итого баллов')) continue;
      if (this.isNotScored(rowText)) continue;

      const cells = row.getElementsByTagNameNS(NS, 'tc');
      for (const cell of cells) {
        const t = cell.textContent.trim();
        if (compCodeRe.test(t)) {
          currentComp = t;
          break;
        }
      }

      const dashItems = this.extractDashItemsFromRow(row);
      if (!dashItems.length || !currentComp) continue;

      if (scoreCol >= cells.length) continue;
      const scoreCell = cells[scoreCol];
      const scoreCellText = this.getCellText(scoreCell);
      const scoreKeys = this.extractScoreKeys(scoreCellText);
      if (!scoreKeys.length) continue;

      const labelText = dashItems[0];
      const rowKey = this.norm(labelText);

      if (scoreKeys.some(sk => sk.includes('SUM') || sk.includes('LEVEL'))) continue;

      compRows.push({
        rowKey,
        label: labelText.replace(/^- /, '').trim(),
        competence: currentComp,
        scoreKeys
      });
    }

    return { rows: compRows, table, xmlDoc, zip, scoreCol };
  },

  async loadPlainTextDoc(file) {
    const zip = await this.loadFile(file);
    const xmlText = await this.getXmlText(zip);
    const xmlDoc = this.parseXml(xmlText);
    return { xmlDoc, zip };
  }
};
