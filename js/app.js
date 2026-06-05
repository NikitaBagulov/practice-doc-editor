const appState = {
  scoreItems: [],
  compRows: [],
  zips: {},
  loaded: { eval: false, comp: false, review: false, task: false, plan: false, config: false }
};

document.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  bindEvents();
  if (location.protocol !== 'file:') {
    setTimeout(() => handleLoadFromFolder(), 300);
  }
});

function bindEvents() {
  document.getElementById('btn-load-folder').addEventListener('click', handleLoadFromFolder);

  document.getElementById('input-student-fio').addEventListener('input', onUserDataChange);
  document.getElementById('input-supervisor-fio').addEventListener('input', onUserDataChange);
  document.getElementById('input-date-start').addEventListener('input', onUserDataChange);
  document.getElementById('input-date-end').addEventListener('input', onUserDataChange);
  document.getElementById('input-semester').addEventListener('input', onUserDataChange);

  document.getElementById('btn-generate').addEventListener('click', handleGenerate);
}

function loadSavedData() {
  const saved = Storage.load();
  if (saved.userData) {
    document.getElementById('input-student-fio').value = saved.userData.studentFio || '';
    document.getElementById('input-supervisor-fio').value = saved.userData.supervisorFio || '';
    document.getElementById('input-date-start').value = saved.userData.dateStart || '';
    document.getElementById('input-date-end').value = saved.userData.dateEnd || '';
    document.getElementById('input-semester').value = saved.userData.semester || 1;
  }
  if (saved.scoreItems) {
    appState.scoreItems = saved.scoreItems;
    renderScores();
    recalculateAll();
  }
}

function onUserDataChange() {
  const userData = getUserData();
  Storage.save({ userData });
  if (appState.scoreItems.length) {
    recalculateAll();
  }
}

function getUserData() {
  const semester = parseInt(document.getElementById('input-semester').value) || 1;
  return {
    studentFio: document.getElementById('input-student-fio').value.trim(),
    supervisorFio: document.getElementById('input-supervisor-fio').value.trim(),
    dateStart: document.getElementById('input-date-start').value.trim(),
    dateEnd: document.getElementById('input-date-end').value.trim(),
    semester: semester,
    studyYear: semester <= 2 ? 1 : 2
  };
}

function setStatus(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'status-msg ' + (type || '');
}

const TEMPLATE_NAMES = {
  eval: 'Оценочный.docx',
  comp: 'Компетенции.docx',
  review: 'Отзыв.docx',
  task: 'Задание.docx',
  plan: 'План.docx',
  config: 'config.json'
};

async function processLoadedFiles(files, restoreSaved = true) {
  const configText = await files['config'].text();
  const userConfig = JSON.parse(configText);
  if (userConfig.semesters) {
    Object.assign(PRACTICE_CONFIG.semesters, userConfig.semesters);
  }
  appState.loaded.config = true;

  const evalData = await TemplateLoader.loadEvalStructure(files['eval']);
  appState.scoreItems = evalData.items;
  appState.zips.eval = evalData.zip;
  appState.loaded.eval = true;

  const saved = restoreSaved ? Storage.load() : null;
  for (const item of appState.scoreItems) {
    item.values = {};
    for (const sk of item.scoreKeys) {
      const savedVal = saved && saved.scoreValues && saved.scoreValues[item.rowKey + '|' + sk];
      item.values[sk] = savedVal !== undefined ? savedVal : 0;
    }
  }

  const compData = await TemplateLoader.loadCompStructure(files['comp']);
  appState.compRows = compData.rows;
  appState.zips.comp = compData.zip;
  appState.loaded.comp = true;

  for (const name of ['review', 'task', 'plan']) {
    const docData = await TemplateLoader.loadPlainTextDoc(files[name]);
    appState.zips[name] = docData.zip;
    appState.loaded[name] = true;
  }

  renderScores();
  recalculateAll();
  Storage.save({ scoreItems: appState.scoreItems, scoreValues: getAllScoreValues() });
}

async function handleLoadFromFolder(fresh = false) {
  if (location.protocol === 'file:') {
    setStatus('upload-status', 'Автозагрузка не работает при file:// протоколе. Запустите сервер или используйте ручную загрузку.', 'error');
    return;
  }

  setStatus('upload-status', 'Загрузка шаблонов из папки templates/...', 'info');

  try {
    const files = {};
    const cacheBust = Date.now();
    for (const [key, filename] of Object.entries(TEMPLATE_NAMES)) {
      const url = 'templates/' + encodeURI(filename) + '?t=' + cacheBust;
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('Не найден файл: ' + url + ' (статус ' + resp.status + ')');
      const blob = await resp.blob();
      files[key] = new File([blob], filename);
    }
    await processLoadedFiles(files, !fresh);
    setStatus('upload-status', 'Шаблоны загружены из папки templates/.', 'success');
  } catch (e) {
    setStatus('upload-status', 'Ошибка загрузки из папки: ' + e.message + '. Используйте ручную загрузку.', 'error');
  }
}

function getAllScoreValues() {
  const vals = {};
  for (const item of appState.scoreItems) {
    for (const sk of item.scoreKeys) {
      vals[item.rowKey + '|' + sk] = item.values[sk];
    }
  }
  return vals;
}

function renderScores() {
  const container = document.getElementById('scores-container');
  container.innerHTML = '';

  if (!appState.scoreItems.length) {
    container.innerHTML = '<p class="placeholder-msg">Загрузите шаблон оценочного листа, чтобы появились поля для баллов.</p>';
    document.getElementById('section-scores-note').textContent = '';
    return;
  }

  document.getElementById('section-scores-note').textContent = '(всего ' + appState.scoreItems.length + ' пунктов)';

  // Group by stage
  const stageOrder = ['P', 'O', 'Z'];
  const stageNames = { 'P': 'Подготовительный этап', 'O': 'Основной этап', 'Z': 'Заключительный этап' };
  const stageClasses = { 'P': 'stage-p', 'O': 'stage-o', 'Z': 'stage-z' };
  const groups = { 'P': [], 'O': [], 'Z': [], '?': [] };

  for (const item of appState.scoreItems) {
    groups[item.stage].push(item);
  }

  for (const stage of stageOrder) {
    const items = groups[stage];
    if (!items.length) continue;

    const block = document.createElement('div');
    block.className = 'stage-block';

    const header = document.createElement('div');
    header.className = 'stage-header ' + (stageClasses[stage] || '');
    header.textContent = stageNames[stage] || stage;
    block.appendChild(header);

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'score-row';

        const label = document.createElement('span');
        label.className = 'score-label';
        label.textContent = item.label;
        row.appendChild(label);

        if (item.criteriaText) {
          const infoBtn = document.createElement('span');
          infoBtn.className = 'criteria-info-btn';
          infoBtn.textContent = '?';
          infoBtn.dataset.tooltip = item.criteriaText
            .replace(/(\d+:)/g, '\n$1').trim()
            .replace(/\n(0:[^\n]*)\n(?=2:)/g, '\n$1\n─────────────\n');
          row.appendChild(infoBtn);
        }

        for (const sk of item.scoreKeys) {
          const input = document.createElement('input');
          input.type = 'number';
          input.min = 0;
          input.max = 2;
          input.value = item.values[sk] || 0;
          input.dataset.rowKey = item.rowKey;
          input.dataset.scoreKey = sk;

          input.addEventListener('input', () => {
            const val = parseInt(input.value) || 0;
            if (val < 0) input.value = 0;
            if (val > 2) input.value = 2;
            item.values[sk] = parseInt(input.value) || 0;
            recalculateAll();
            Storage.save({ scoreItems: appState.scoreItems, scoreValues: getAllScoreValues() });
          });

          row.appendChild(input);
        }

        block.appendChild(row);
      }

    container.appendChild(block);
  }
}

function recalculateAll() {
  const userData = getUserData();
  const semester = userData.semester;
  const semConfig = PRACTICE_CONFIG.semesters[semester];
  if (!semConfig) return;

  const thresholds = semConfig.stage_thresholds || { P: 0, O: 0, Z: 0 };

  // 1. Stage sums
  const stageSums = Calculator.computeStageSums(appState.scoreItems);
  const stageResults = Calculator.computeStageResults(stageSums, thresholds);

  // 2. Competence totals
  const scoreByScoreKey = Calculator.buildScoreMapByScoreKey(appState.scoreItems);
  const compTotals = Calculator.computeCompetenceTotals(appState.compRows, scoreByScoreKey);
  const compLevels = Calculator.computeCompetenceLevels(compTotals, String(semester), PRACTICE_CONFIG);
  const totalSum = Object.values(compTotals).reduce((a, b) => a + b, 0);

  // 3. Final result
  const rules = semConfig.final_rules || {};
  const final = Calculator.computeFinalResult(stageResults, compLevels, semester, rules);

  renderResults(stageSums, stageResults, compTotals, compLevels, totalSum, final);
}

function renderResults(stageSums, stageResults, compTotals, compLevels, totalSum, final) {
  const stageNames = { 'P': 'Подготовительный', 'O': 'Основной', 'Z': 'Заключительный' };
  const stageMax = { 'P': 13, 'O': 36, 'Z': 10 };

  const sem = getUserData().semester;
  const semConfig = PRACTICE_CONFIG.semesters[sem];

  // Stage results
  const stageDiv = document.getElementById('stage-results');
  stageDiv.innerHTML = '';
  for (const s of ['P', 'O', 'Z']) {
    const item = document.createElement('div');
    item.className = 'result-item';

    const label = document.createElement('span');
    label.className = 'result-label';
    const need = semConfig ? semConfig.stage_thresholds[s] : 0;
    label.textContent = stageNames[s] + ' — ' + stageSums[s] + ' / ' + stageMax[s] + ' (нужно ' + need + ')';
    item.appendChild(label);

    const val = document.createElement('span');
    val.className = 'result-value ' + (stageResults[s] === 'зачтено' ? 'pass' : 'fail');
    val.textContent = stageResults[s];
    item.appendChild(val);

    stageDiv.appendChild(item);
  }

  // Competence results
  const compDiv = document.getElementById('comp-results');
  compDiv.innerHTML = '';
  for (const [code, sum] of Object.entries(compTotals)) {
    const levels = semConfig ? semConfig.competence_levels[code] : null;
    const maxScore = levels ? levels[0].max : '?';

    const item = document.createElement('div');
    item.className = 'result-item';

    const label = document.createElement('span');
    label.className = 'result-label';
    label.textContent = code + ' — ' + sum + ' / ' + maxScore;
    item.appendChild(label);

    const val = document.createElement('span');
    val.className = 'result-value ' + (compLevels[code] !== 'не сформирована' ? 'pass' : 'fail');
    val.textContent = compLevels[code] || '—';
    item.appendChild(val);

    compDiv.appendChild(item);
  }

  // Final result
  const finalDiv = document.getElementById('final-result');
  finalDiv.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'result-item';

  const compMaxTotal = Object.keys(compTotals).reduce((sum, code) => {
    const levels = semConfig ? semConfig.competence_levels[code] : null;
    return sum + (levels ? levels[0].max : 0);
  }, 0);

  const label = document.createElement('span');
  label.className = 'result-label';
  label.textContent = 'Общая сумма: ' + totalSum + ' / ' + compMaxTotal + '. Итог:';
  item.appendChild(label);

  const val = document.createElement('span');
  val.className = 'result-value final-result-value ' + (final === 'зачтено' ? 'pass' : 'fail');
  val.textContent = final;
  item.appendChild(val);

  finalDiv.appendChild(item);

  if (final === 'не зачтено') {
    const reasons = [];

    const failedStages = Object.entries(stageResults).filter(([, r]) => r !== 'зачтено').map(([s]) => stageNames[s]);
    if (failedStages.length) {
      reasons.push('не зачтено по этапам: ' + failedStages.join(', '));
    }

    if (sem === 1) {
      const bad = Object.entries(compLevels).filter(([, l]) => l === 'не сформирована').map(([c]) => c);
      if (bad.length >= 3) {
        reasons.push('не сформированы компетенции (3 и более): ' + bad.join(', '));
      }
    } else if (sem === 2) {
      const bad = Object.entries(compLevels).filter(([, l]) => l === 'не сформирована' || l === 'сформирована на базовом уровне 1').map(([c]) => c);
      if (bad.length >= 3) {
        reasons.push('не сформированы или базовый уровень 1 (3 и более): ' + bad.join(', '));
      }
    } else if (sem === 3) {
      const bad = Object.entries(compLevels).filter(([, l]) => l !== 'сформирована').map(([c]) => c);
      if (bad.length) {
        reasons.push('не все компетенции сформированы: ' + bad.join(', '));
      }
    }

    if (reasons.length) {
      const reasonDiv = document.createElement('div');
      reasonDiv.className = 'result-item result-reason';
      const reasonLabel = document.createElement('span');
      reasonLabel.className = 'result-label';
      reasonLabel.textContent = 'Причина: ' + reasons.join('; ') + '.';
      reasonDiv.appendChild(reasonLabel);
      finalDiv.appendChild(reasonDiv);
    }
  }
}

const MONTHS_GENITIVE = {
  '01': 'января', '02': 'февраля', '03': 'марта', '04': 'апреля',
  '05': 'мая', '06': 'июня', '07': 'июля', '08': 'августа',
  '09': 'сентября', '10': 'октября', '11': 'ноября', '12': 'декабря'
};

function formatDate(dateStr) {
  const parts = dateStr.replace(/[«»]/g, '').split(/[.\s-]+/);
  if (parts.length < 3) return dateStr;
  let [d, m, y] = parts;
  d = String(parseInt(d));
  const month = MONTHS_GENITIVE[m.padStart(2, '0')];
  return month ? '«' + d + '» ' + month + ' ' + y + ' г.' : dateStr;
}

async function handleGenerate() {
  if (!appState.loaded.eval) {
    setStatus('generate-status', 'Сначала загрузите шаблоны.', 'error');
    return;
  }

  const userData = getUserData();
  if (!userData.studentFio || !userData.supervisorFio) {
    setStatus('generate-status', 'Заполните ФИО магистранта и руководителя.', 'error');
    return;
  }

  setStatus('generate-status', 'Формирование документов...', 'info');

  try {
    const semester = userData.semester;
    const semConfig = PRACTICE_CONFIG.semesters[semester];
    if (!semConfig) throw new Error('Нет конфигурации для семестра ' + semester);

    const thresholds = semConfig.stage_thresholds || {};
    const scoreByScoreKey = Calculator.buildScoreMapByScoreKey(appState.scoreItems);

    // Stage calculations
    const stageSums = Calculator.computeStageSums(appState.scoreItems);
    const stageResults = Calculator.computeStageResults(stageSums, thresholds);
    const compTotals = Calculator.computeCompetenceTotals(appState.compRows, scoreByScoreKey);
    const compLevels = Calculator.computeCompetenceLevels(compTotals, String(semester), PRACTICE_CONFIG);
    const totalSum = Object.values(compTotals).reduce((a, b) => a + b, 0);
    const final = Calculator.computeFinalResult(stageResults, compLevels, semester, semConfig.final_rules || {});

    // Base mapping for all docs
    const baseMapping = {
      '{{STUDENT_FIO}}': userData.studentFio,
      '{{SUPERVISOR_FIO}}': userData.supervisorFio,
      '{{DATE_START}}': formatDate(userData.dateStart),
      '{{DATE_END}}': formatDate(userData.dateEnd),
      '{{SEMESTER}}': String(userData.semester),
      '{{STUDY_YEAR}}': String(userData.studyYear)
    };

    // Stage results mapping
    const stageMapping = {
      '{{P_SUM}}': String(stageSums['P']),
      '{{O_SUM}}': String(stageSums['O']),
      '{{Z_SUM}}': String(stageSums['Z']),
      '{{P_RESULT}}': stageResults['P'],
      '{{O_RESULT}}': stageResults['O'],
      '{{Z_RESULT}}': stageResults['Z'],
      '{{TOTAL_SUM}}': String(totalSum),
      '{{FINAL_RESULT}}': final
    };

    // Competence mapping
    const compMapping = {};
    for (const code of Object.keys(compTotals)) {
      compMapping[codeToSumKey(code)] = String(compTotals[code]);
      compMapping[codeToLevelKey(code)] = compLevels[code] || '—';
    }

    // Full mapping for review & base docs
    const fullMapping = Object.assign({}, baseMapping, stageMapping, compMapping);

    // --- Generate each document ---
    const filesToGenerate = [
      { name: 'eval', zip: appState.zips.eval, mapping: null, filename: 'Оценочный_лист_заполнен.docx' },
      { name: 'comp', zip: appState.zips.comp, mapping: null, filename: 'Лист_компетенций_заполнен.docx' },
      { name: 'review', zip: appState.zips.review, mapping: fullMapping, filename: 'Отзыв_заполнен.docx' },
      { name: 'task', zip: appState.zips.task, mapping: fullMapping, filename: 'Индивидуальное_задание_заполнено.docx' },
      { name: 'plan', zip: appState.zips.plan, mapping: fullMapping, filename: 'План_график_заполнен.docx' }
    ];

    // For eval and comp, we need base mapping + score replacements
    const evalMapping = Object.assign({}, baseMapping);
    const compMappingDoc = Object.assign({}, baseMapping);

    // Process eval scores
    const evalZip = await DocxBuilder.generateDoc(appState.zips.eval, evalMapping);
    // Fill score cells for eval template
    const evalXmlText = await evalZip.file('word/document.xml').async('string');
    const evalXmlDoc = new DOMParser().parseFromString(evalXmlText, 'text/xml');
    await fillScoreCellsInXml(evalXmlDoc, appState.scoreItems, 'Балл');
    const serializer = new XMLSerializer();
    const newEvalXml = serializer.serializeToString(evalXmlDoc);
    evalZip.file('word/document.xml', newEvalXml);

    const evalBlob = await evalZip.generateAsync({ type: 'blob' });
    saveAs(evalBlob, 'Оценочный_лист_заполнен.docx');

    // Process comp scores
    const compZip = await DocxBuilder.generateDoc(appState.zips.comp, compMappingDoc);
    const compXmlText = await compZip.file('word/document.xml').async('string');
    const compXmlDoc = new DOMParser().parseFromString(compXmlText, 'text/xml');
    fillScoreCellsByKey(compXmlDoc, appState.scoreItems);
    DocxBuilder._replaceAllInDoc(compXmlDoc, compMapping);
    const newCompXml = serializer.serializeToString(compXmlDoc);
    compZip.file('word/document.xml', newCompXml);

    const compBlob = await compZip.generateAsync({ type: 'blob' });
    saveAs(compBlob, 'Лист_компетенций_заполнен.docx');

    // Generate other docs
    for (const f of filesToGenerate) {
      if (f.name === 'eval' || f.name === 'comp') continue;
      const zip = await DocxBuilder.generateDoc(f.zip, f.mapping);
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, f.filename);
    }

    setStatus('generate-status', 'Все документы сформированы и скачаны.', 'success');

  } catch (e) {
    setStatus('generate-status', 'Ошибка: ' + e.message, 'error');
    console.error(e);
  }
}

async function fillScoreCellsInXml(xmlDoc, scoreItems, scoreHeader) {
  const tables = xmlDoc.getElementsByTagNameNS(NS, 'tbl');
  if (!tables.length) return;

  const table = tables[0];
  const scoreCol = TemplateLoader.findColumnByHeader(table, scoreHeader);
  if (scoreCol < 0) return;

  const rows = table.getElementsByTagNameNS(NS, 'tr');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowText = TemplateLoader.getRowText(row);
    if (TemplateLoader.isNotScored(rowText)) continue;

    const dashItems = TemplateLoader.extractDashItemsFromRow(row);
    if (!dashItems.length) continue;

    const rowKey = TemplateLoader.norm(dashItems[0]);
    const scoreItem = scoreItems.find(si => si.rowKey === rowKey);
    if (!scoreItem) continue;

    const cells = row.getElementsByTagNameNS(NS, 'tc');
    if (scoreCol >= cells.length) continue;

    const cell = cells[scoreCol];
    const cellText = TemplateLoader.getCellText(cell);
    const scoreKeysInCell = TemplateLoader.extractScoreKeys(cellText);

    const mapping = {};
    for (const sk of scoreKeysInCell) {
      if (scoreItem.values[sk] !== undefined) {
        mapping[sk] = String(scoreItem.values[sk]);
      }
    }

    if (Object.keys(mapping).length > 0) {
      DocxBuilder._replaceInCell(cell, mapping);
    }
  }
}

function fillScoreCellsByKey(xmlDoc, scoreItems) {
  const tables = xmlDoc.getElementsByTagNameNS(NS, 'tbl');
  if (!tables.length) return;

  const scoreKeyValues = {};
  for (const item of scoreItems) {
    for (const sk of item.scoreKeys) {
      scoreKeyValues[sk] = String(item.values[sk] || 0);
    }
  }

  for (let ti = 0; ti < tables.length; ti++) {
    const rows = tables[ti].getElementsByTagNameNS(NS, 'tr');
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri].getElementsByTagNameNS(NS, 'tc');
      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        const cellText = TemplateLoader.getCellText(cell);
        const scoreKeys = TemplateLoader.extractScoreKeys(cellText);
        if (!scoreKeys.length) continue;
        const mapping = {};
        for (const sk of scoreKeys) {
          if (scoreKeyValues[sk] !== undefined) {
            mapping[sk] = scoreKeyValues[sk];
          }
        }
        if (Object.keys(mapping).length > 0) {
          DocxBuilder._replaceInCell(cell, mapping);
        }
      }
    }
  }
}


