const Calculator = {

  computeStageSums(scoreItems) {
    const sums = { P: 0, O: 0, Z: 0 };
    for (const item of scoreItems) {
      if (sums.hasOwnProperty(item.stage)) {
        for (let i = 0; i < item.scoreKeys.length; i++) {
          sums[item.stage] += this.getScoreItemValue(item, i);
        }
      }
    }
    return sums;
  },

  clampScore(value, max) {
    const parsed = parseInt(value) || 0;
    return Math.max(0, Math.min(parsed, max));
  },

  getScoreItemValue(item, scoreIndex) {
    const key = item.scoreKeys[scoreIndex];
    const max = item.scoreMaxes && item.scoreMaxes[scoreIndex] !== undefined
      ? item.scoreMaxes[scoreIndex]
      : 2;
    return this.clampScore(item.values && item.values[key], max);
  },

  computeStageResults(stageSums, thresholds) {
    const results = {};
    for (const stage of ['P', 'O', 'Z']) {
      const need = thresholds[stage] || 0;
      results[stage] = stageSums[stage] >= need ? 'зачтено' : 'не зачтено';
    }
    return results;
  },

  computeCompetenceTotals(compRows, scoreItems) {
    const totals = {};
    for (const row of compRows) {
      let sum = 0;
      for (let i = 0; i < row.scoreKeys.length; i++) {
        sum += this.findCompetenceScoreValue(row, i, scoreItems);
      }
      totals[row.competence] = (totals[row.competence] || 0) + sum;
    }
    return totals;
  },

  getCandidateRowKeys(row, scoreIndex) {
    const rowKeys = row.rowKeys && row.rowKeys.length ? row.rowKeys : [row.rowKey];
    if (rowKeys.length > 1 && scoreIndex < rowKeys.length) {
      return [rowKeys[scoreIndex]];
    }
    return rowKeys;
  },

  normCriteria(text) {
    return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  },

  criteriaMatches(a, b) {
    const left = this.normCriteria(a);
    const right = this.normCriteria(b);
    if (!left || !right) return false;
    return left.includes(right) || right.includes(left);
  },

  findCompetenceScoreValue(row, scoreIndex, scoreItems) {
    const scoreKey = row.scoreKeys[scoreIndex];
    const candidateRowKeys = this.getCandidateRowKeys(row, scoreIndex);
    const candidates = scoreItems.filter(item => candidateRowKeys.includes(item.rowKey));
    const criteriaBlock = row.criteriaBlocks && row.criteriaBlocks[scoreIndex];

    for (const item of candidates) {
      if (item.values && item.values[scoreKey] !== undefined) {
        const index = item.scoreKeys.indexOf(scoreKey);
        return this.getScoreItemValue(item, index >= 0 ? index : 0);
      }
    }

    if (criteriaBlock) {
      for (const item of candidates) {
        const blocks = item.criteriaBlocks || [];
        for (let i = 0; i < blocks.length; i++) {
          if (this.criteriaMatches(blocks[i], criteriaBlock)) {
            return this.getScoreItemValue(item, i);
          }
        }
      }
    }

    if (candidates.length === 1 && candidates[0].scoreKeys.length === 1) {
      return this.getScoreItemValue(candidates[0], 0);
    }

    return 0;
  },

  computeCompetenceLevels(compTotals, semester, config) {
    const levels = {};
    const semConfig = config.semesters[semester];
    if (!semConfig) return levels;

    const levelDefs = semConfig.competence_levels || {};
    for (const [code, points] of Object.entries(compTotals)) {
      const scale = levelDefs[code];
      if (!scale) {
        levels[code] = '—';
        continue;
      }
      let found = '—';
      for (const item of scale) {
        if (points >= item.min && points <= item.max) {
          found = item.label;
          break;
        }
      }
      levels[code] = found;
    }
    return levels;
  },

  computeFinalResult(stageResults, compLevels, semester, rules) {
    for (const stage of ['P', 'O', 'Z']) {
      if (stageResults[stage] !== 'зачтено') return 'не зачтено';
    }

    const levels = Object.values(compLevels);

    if (semester === 1) {
      const ok = levels.filter(l => l !== 'не сформирована').length;
      return ok >= 6 ? 'зачтено' : 'не зачтено';
    } else if (semester === 2) {
      const ok = levels.filter(l => l === 'сформирована' || l === 'сформирована на базовом уровне 2').length;
      return ok >= 6 ? 'зачтено' : 'не зачтено';
    } else if (semester === 3) {
      return levels.every(l => l === 'сформирована') ? 'зачтено' : 'не зачтено';
    }

    return 'не зачтено';
  }
};
