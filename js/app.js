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

  document.getElementById('btn-generate-all').addEventListener('click', handleGenerateAll);
  document.querySelectorAll('[data-doc]').forEach(btn => {
    btn.addEventListener('click', () => handleGenerateOne(btn.dataset.doc));
  });
  document.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', () => handlePreview(btn.dataset.preview));
  });
  document.getElementById('btn-close-preview').addEventListener('click', closePreview);
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
    item.scoreMaxes = item.scoreMaxes || item.scoreKeys.map(() => 2);
    for (let i = 0; i < item.scoreKeys.length; i++) {
      const sk = item.scoreKeys[i];
      const max = item.scoreMaxes[i] !== undefined ? item.scoreMaxes[i] : 2;
      const savedVal = saved && saved.scoreValues && saved.scoreValues[item.rowKey + '|' + sk];
      item.values[sk] = clampScoreValue(savedVal !== undefined ? savedVal : 0, max);
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

function clampScoreValue(value, max) {
  const parsed = parseInt(value) || 0;
  return Math.max(0, Math.min(parsed, max));
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

        item.scoreMaxes = item.scoreMaxes || item.scoreKeys.map(() => 2);

        for (let i = 0; i < item.scoreKeys.length; i++) {
          const sk = item.scoreKeys[i];
          const max = item.scoreMaxes[i] !== undefined ? item.scoreMaxes[i] : 2;
          item.values[sk] = clampScoreValue(item.values[sk], max);

          const input = document.createElement('input');
          input.type = 'number';
          input.min = 0;
          input.max = max;
          input.value = item.values[sk] || 0;
          input.dataset.rowKey = item.rowKey;
          input.dataset.scoreKey = sk;

          input.addEventListener('input', () => {
            item.values[sk] = clampScoreValue(input.value, max);
            input.value = item.values[sk];
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
  const compTotals = Calculator.computeCompetenceTotals(appState.compRows, appState.scoreItems);
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

function detectFioGender(parts) {
  const patronymic = (parts[2] || '').toLowerCase();
  if (patronymic.endsWith('вна') || patronymic.endsWith('чна')) return 'female';
  if (patronymic.endsWith('ич')) return 'male';

  const firstName = (parts[1] || '').toLowerCase();
  return /[ая]$/.test(firstName) ? 'female' : 'male';
}

function replaceEnding(word, ending, replacement) {
  return word.slice(0, word.length - ending.length) + replacement;
}

function declineLastName(word, gender, grammaticalCase) {
  const lower = word.toLowerCase();
  const isGenitive = grammaticalCase === 'genitive';

  if (gender === 'female') {
    if (/(ова|ева|ёва|ина|ына)$/.test(lower)) return word + 'ой';
    if (lower.endsWith('ая')) return replaceEnding(word, 'ая', isGenitive ? 'ой' : 'ой');
    if (lower.endsWith('яя')) return replaceEnding(word, 'яя', isGenitive ? 'ей' : 'ей');
    if (lower.endsWith('а')) return replaceEnding(word, 'а', isGenitive ? 'ы' : 'е');
    if (lower.endsWith('я')) return replaceEnding(word, 'я', isGenitive ? 'и' : 'е');
    return word;
  }

  if (lower.endsWith('ский')) return replaceEnding(word, 'ский', isGenitive ? 'ского' : 'скому');
  if (lower.endsWith('цкий')) return replaceEnding(word, 'цкий', isGenitive ? 'цкого' : 'цкому');
  if (lower.endsWith('ой')) return replaceEnding(word, 'ой', isGenitive ? 'ого' : 'ому');
  if (/(ов|ев|ёв|ин|ын)$/.test(lower)) return word + (isGenitive ? 'а' : 'у');
  if (lower.endsWith('й') || lower.endsWith('ь')) return word.slice(0, -1) + (isGenitive ? 'я' : 'ю');
  if (lower.endsWith('а')) return word.slice(0, -1) + (isGenitive ? 'ы' : 'е');
  if (lower.endsWith('я')) return word.slice(0, -1) + (isGenitive ? 'и' : 'е');
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(lower)) return word + (isGenitive ? 'а' : 'у');
  return word;
}

function declineFirstName(word, gender, grammaticalCase) {
  const lower = word.toLowerCase();
  const isGenitive = grammaticalCase === 'genitive';

  if (lower.endsWith('й') || lower.endsWith('ь')) return word.slice(0, -1) + (isGenitive ? 'я' : 'ю');
  if (lower.endsWith('а')) return word.slice(0, -1) + (isGenitive ? 'ы' : 'е');
  if (lower.endsWith('я')) return word.slice(0, -1) + (isGenitive ? 'и' : 'е');
  if (gender === 'male' && /[бвгджзклмнпрстфхцчшщ]$/.test(lower)) {
    return word + (isGenitive ? 'а' : 'у');
  }
  return word;
}

function declinePatronymic(word, grammaticalCase) {
  const lower = word.toLowerCase();
  const isGenitive = grammaticalCase === 'genitive';

  if (lower.endsWith('ич')) return word + (isGenitive ? 'а' : 'у');
  if (lower.endsWith('на')) return word.slice(0, -1) + (isGenitive ? 'ы' : 'е');
  return word;
}

function declineFullName(fio, grammaticalCase) {
  const parts = fio.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fio;

  const gender = detectFioGender(parts);
  const declined = parts.slice();

  declined[0] = declineLastName(parts[0], gender, grammaticalCase);
  declined[1] = declineFirstName(parts[1], gender, grammaticalCase);
  if (parts[2]) declined[2] = declinePatronymic(parts[2], grammaticalCase);

  return declined.join(' ');
}

const DOCUMENTS_TO_GENERATE = [
  { name: 'eval', filename: 'Оценочный_лист_заполнен.docx', label: 'Оценочный лист' },
  { name: 'comp', filename: 'Лист_компетенций_заполнен.docx', label: 'Лист компетенций' },
  { name: 'review', filename: 'Отзыв_заполнен.docx', label: 'Отзыв' },
  { name: 'task', filename: 'Индивидуальное_задание_заполнено.docx', label: 'Индивидуальное задание' },
  { name: 'plan', filename: 'План_график_заполнен.docx', label: 'План-график' }
];

function getDocumentConfig(name) {
  return DOCUMENTS_TO_GENERATE.find(doc => doc.name === name);
}

function ensureCanGenerate() {
  if (!appState.loaded.eval) {
    throw new Error('Сначала загрузите шаблоны.');
  }

  const userData = getUserData();
  if (!userData.studentFio || !userData.supervisorFio) {
    throw new Error('Заполните ФИО магистранта и руководителя.');
  }

  return userData;
}

function buildGenerationContext(userData) {
  const semester = userData.semester;
  const semConfig = PRACTICE_CONFIG.semesters[semester];
  if (!semConfig) throw new Error('Нет конфигурации для семестра ' + semester);

  const thresholds = semConfig.stage_thresholds || {};
  const stageSums = Calculator.computeStageSums(appState.scoreItems);
  const stageResults = Calculator.computeStageResults(stageSums, thresholds);
  const compTotals = Calculator.computeCompetenceTotals(appState.compRows, appState.scoreItems);
  const compLevels = Calculator.computeCompetenceLevels(compTotals, String(semester), PRACTICE_CONFIG);
  const totalSum = Object.values(compTotals).reduce((a, b) => a + b, 0);
  const final = Calculator.computeFinalResult(stageResults, compLevels, semester, semConfig.final_rules || {});

  const baseMapping = {
    '{{STUDENT_FIO}}': userData.studentFio,
    '{{STUDENT_FIO_GENITIVE}}': declineFullName(userData.studentFio, 'genitive'),
    '{{STUDENT_FIO_DATIVE}}': declineFullName(userData.studentFio, 'dative'),
    '{{SUPERVISOR_FIO}}': userData.supervisorFio,
    '{{SUPERVISOR_FIO_GENITIVE}}': declineFullName(userData.supervisorFio, 'genitive'),
    '{{SUPERVISOR_FIO_DATIVE}}': declineFullName(userData.supervisorFio, 'dative'),
    '{{DATE_START}}': formatDate(userData.dateStart),
    '{{DATE_END}}': formatDate(userData.dateEnd),
    '{{SEMESTER}}': String(userData.semester),
    '{{STUDY_YEAR}}': String(userData.studyYear)
  };

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

  const compMapping = {};
  for (const code of Object.keys(compTotals)) {
    compMapping[codeToSumKey(code)] = String(compTotals[code]);
    compMapping[codeToLevelKey(code)] = compLevels[code] || '—';
  }

  return {
    baseMapping,
    compMapping,
    fullMapping: Object.assign({}, baseMapping, stageMapping, compMapping)
  };
}

async function generateEvalZip(context) {
  const zip = await DocxBuilder.generateDoc(appState.zips.eval, context.baseMapping);
  const xmlText = await zip.file('word/document.xml').async('string');
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
  await fillScoreCellsInXml(xmlDoc, appState.scoreItems, 'Балл');
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
  return zip;
}

async function generateCompZip(context) {
  const zip = await DocxBuilder.generateDoc(appState.zips.comp, context.baseMapping);
  const xmlText = await zip.file('word/document.xml').async('string');
  const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
  fillScoreCellsByKey(xmlDoc, appState.compRows, appState.scoreItems);
  DocxBuilder._replaceAllInDoc(xmlDoc, context.compMapping);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
  return zip;
}

async function generateDocumentZip(name, context) {
  if (name === 'eval') return generateEvalZip(context);
  if (name === 'comp') return generateCompZip(context);
  if (!appState.zips[name]) throw new Error('Шаблон не загружен: ' + name);
  return DocxBuilder.generateDoc(appState.zips[name], context.fullMapping);
}

async function createGenerationContext() {
  const userData = ensureCanGenerate();
  return buildGenerationContext(userData);
}

async function handleGenerateOne(name) {
  const doc = getDocumentConfig(name);
  if (!doc) return;

  setStatus('generate-status', 'Формирование документа: ' + doc.label + '...', 'info');

  try {
    const context = await createGenerationContext();
    const zip = await generateDocumentZip(name, context);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, doc.filename);
    setStatus('generate-status', 'Документ сформирован: ' + doc.label + '.', 'success');
  } catch (e) {
    setStatus('generate-status', 'Ошибка: ' + e.message, 'error');
    console.error(e);
  }
}

async function handleGenerateAll() {
  setStatus('generate-status', 'Формирование архива документов...', 'info');

  try {
    const context = await createGenerationContext();
    const bundle = new JSZip();

    for (const doc of DOCUMENTS_TO_GENERATE) {
      const zip = await generateDocumentZip(doc.name, context);
      const bytes = await zip.generateAsync({ type: 'uint8array' });
      bundle.file(doc.filename, bytes);
    }

    const blob = await bundle.generateAsync({ type: 'blob' });
    saveAs(blob, 'Документы_практики.zip');
    setStatus('generate-status', 'Архив со всеми документами сформирован.', 'success');
  } catch (e) {
    setStatus('generate-status', 'Ошибка: ' + e.message, 'error');
    console.error(e);
  }
}

function closePreview() {
  document.getElementById('preview-panel').hidden = true;
  document.getElementById('preview-content').innerHTML = '';
}

async function handlePreview(name) {
  const doc = getDocumentConfig(name);
  if (!doc) return;

  const panel = document.getElementById('preview-panel');
  const title = document.getElementById('preview-title');
  const content = document.getElementById('preview-content');

  title.textContent = 'Предпросмотр: ' + doc.label;
  panel.hidden = false;
  content.innerHTML = '<div class="preview-message">Формирование предпросмотра...</div>';
  setStatus('generate-status', 'Формирование предпросмотра: ' + doc.label + '...', 'info');

  try {
    if (!window.docx || !window.docx.renderAsync) {
      throw new Error('Библиотека предпросмотра не загружена. Проверьте подключение к интернету и обновите страницу.');
    }

    const context = await createGenerationContext();
    const zip = await generateDocumentZip(name, context);
    const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    content.innerHTML = '';
    await window.docx.renderAsync(arrayBuffer, content, null, {
      className: 'docx-preview-document',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true
    });

    setStatus('generate-status', 'Предпросмотр сформирован: ' + doc.label + '.', 'success');
  } catch (e) {
    content.innerHTML = '<div class="preview-message">Ошибка предпросмотра: ' + e.message + '</div>';
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

function replaceScorePlaceholdersInCell(cell, values) {
  if (!values.length) return;

  let valueIndex = 0;
  const ps = cell.getElementsByTagNameNS(NS, 'p');

  for (const p of Array.from(ps)) {
    const fullText = DocxBuilder._getParagraphText(p);
    if (!TemplateLoader.extractScoreKeys(fullText).length) continue;

    const newText = fullText.replace(/\{\{SCORE(?:_\d+)?\}\}/g, () => {
      const value = values[valueIndex] !== undefined ? values[valueIndex] : 0;
      valueIndex++;
      return String(value);
    });

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
  }
}

function fillScoreCellsByKey(xmlDoc, compRows, scoreItems) {
  const tables = xmlDoc.getElementsByTagNameNS(NS, 'tbl');
  if (!tables.length) return;

  let compRowIndex = 0;

  for (let ti = 0; ti < tables.length; ti++) {
    const rows = tables[ti].getElementsByTagNameNS(NS, 'tr');
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri].getElementsByTagNameNS(NS, 'tc');
      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        const cellText = TemplateLoader.getCellText(cell);
        const scoreKeys = TemplateLoader.extractScoreKeys(cellText);
        if (!scoreKeys.length) continue;

        const compRow = compRows[compRowIndex];
        if (!compRow) return;
        compRowIndex++;

        if (scoreKeys.some(sk => sk.includes('SUM') || sk.includes('LEVEL'))) continue;

        const slotCount = Math.max(
          compRow.scoreSlotCount || 0,
          compRow.scoreKeys.length,
          compRow.criteriaBlocks ? compRow.criteriaBlocks.length : 0,
          compRow.rowKeys ? compRow.rowKeys.length : 0
        );
        const values = Array.from({ length: slotCount }, (_, index) => (
          Calculator.findCompetenceScoreValue(compRow, index, scoreItems)
        ));
        replaceScorePlaceholdersInCell(cell, values);
      }
    }
  }
}


