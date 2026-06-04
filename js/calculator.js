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

  computeCompetenceTotals(compRows, scoreItemsByScoreKey) {
    const totals = {};
    for (const row of compRows) {
      let sum = 0;
      for (const sk of row.scoreKeys) {
        sum += (scoreItemsByScoreKey[sk] || 0);
      }
      totals[row.competence] = (totals[row.competence] || 0) + sum;
    }
    return totals;
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
  },

  buildScoreMapByRowKey(scoreItems) {
    const map = {};
    for (const item of scoreItems) {
      map[item.rowKey] = {};
      for (const sk of item.scoreKeys) {
        map[item.rowKey][sk] = item.values[sk] || 0;
      }
    }
    return map;
  },

  buildScoreMapByScoreKey(scoreItems) {
    const map = {};
    for (const item of scoreItems) {
      for (const sk of item.scoreKeys) {
        map[sk] = item.values[sk] || 0;
      }
    }
    return map;
  }
};
