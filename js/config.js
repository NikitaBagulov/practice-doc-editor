const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const STAGE_CONFIG = {
  stage_thresholds: { P: 5, O: 13, Z: 4 },
  stage_max_scores: { P: 13, O: 36, Z: 10 },
  final_rules: { require_all_stages_passed: true, min_ok_competences: 6 },
  competence_levels: {
    "УК-1": [
      { "min": 4, "max": 6, "label": "сформирована" },
      { "min": 2, "max": 3, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 1, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "УК-2": [
      { "min": 5, "max": 7, "label": "сформирована" },
      { "min": 2, "max": 4, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 2, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "УК-3": [
      { "min": 6, "max": 8, "label": "сформирована" },
      { "min": 3, "max": 5, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 2, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "УК-5": [
      { "min": 4, "max": 6, "label": "сформирована" },
      { "min": 2, "max": 3, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 1, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "УК-6": [
      { "min": 4, "max": 5, "label": "сформирована" },
      { "min": 2, "max": 3, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 1, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "ОПК-2": [
      { "min": 5, "max": 7, "label": "сформирована" },
      { "min": 2, "max": 4, "label": "сформирована на базовом уровне 2" },
      { "min": 1, "max": 2, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 0, "label": "не сформирована" }
    ],
    "ОПК-4": [
      { "min": 8, "max": 10, "label": "сформирована" },
      { "min": 5, "max": 7, "label": "сформирована на базовом уровне 2" },
      { "min": 2, "max": 4, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 1, "label": "не сформирована" }
    ],
    "ПКА-2": [
      { "min": 8, "max": 10, "label": "сформирована" },
      { "min": 5, "max": 7, "label": "сформирована на базовом уровне 2" },
      { "min": 2, "max": 4, "label": "сформирована на базовом уровне 1" },
      { "min": 0, "max": 1, "label": "не сформирована" }
    ]
  }
};

const PRACTICE_CONFIG = {
  "semesters": {
    "1": JSON.parse(JSON.stringify(STAGE_CONFIG)),
    "2": JSON.parse(JSON.stringify(STAGE_CONFIG)),
    "3": JSON.parse(JSON.stringify(STAGE_CONFIG))
  }
};

const PLACEHOLDER_MAP = {
  prefix: {
    'УК': 'UK',
    'ОПК': 'OPK',
    'ПКА': 'PKA'
  }
};

function codeToSumKey(code) {
  const [prefix, num] = code.split('-');
  const mapped = PLACEHOLDER_MAP.prefix[prefix] || prefix;
  return `{{${mapped}${num}_SUM}}`;
}

function codeToLevelKey(code) {
  const [prefix, num] = code.split('-');
  const mapped = PLACEHOLDER_MAP.prefix[prefix] || prefix;
  return `{{${mapped}${num}_LEVEL}}`;
}
