function sumMacros(items) {
  return items.reduce((a, i) => ({
    kcal:    a.kcal    + (i.kcal    || 0),
    protein: a.protein + (i.protein || 0),
    carbs:   a.carbs   + (i.carbs   || 0),
    fat:     a.fat     + (i.fat     || 0),
    fibre:   a.fibre   + (i.fibre   || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
}
