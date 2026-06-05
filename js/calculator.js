const Calculator = {

  computeStageSums(scoreItems) {
    const sums = { P: 0, O: 0, Z: 0 };
    for (const item of scoreItems) {
      if (sums.hasOwnProperty(item.stage)) {
        for (const sk of item.scoreKeys) {
          sums[item.stage] += (item.values[sk] || 0);
        }
      }
    }
    return sums;
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
        return item.values[scoreKey] || 0;
      }
    }

    if (criteriaBlock) {
      for (const item of candidates) {
        const blocks = item.criteriaBlocks || [];
        for (let i = 0; i < blocks.length; i++) {
          if (this.criteriaMatches(blocks[i], criteriaBlock)) {
            const key = item.scoreKeys[i];
            return (item.values && item.values[key]) || 0;
          }
        }
      }
    }

    if (candidates.length === 1 && candidates[0].scoreKeys.length === 1) {
      const key = candidates[0].scoreKeys[0];
      return (candidates[0].values && candidates[0].values[key]) || 0;
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
