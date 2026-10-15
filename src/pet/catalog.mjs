export const PET_CHARACTERS = Object.freeze([
  {id:'aps-dog',name:'小狗',nameEn:'Dog',free:true},
  {id:'aps-cat',name:'小猫',nameEn:'Cat',free:true},
  {id:'aps-capybara',name:'水豚',nameEn:'Capybara',free:true},
  {id:'aps-outline-dog',name:'线描犬',nameEn:'Outline dog',free:true},
].map(Object.freeze));
export const PET_ITEMS = Object.freeze([
  {id:'hat',name:'小帽子',nameEn:'Little hat',slot:'hat',price:6},
  {id:'scarf',name:'围巾',nameEn:'Scarf',slot:'scarf',price:6},
  {id:'wave',name:'招手动作',nameEn:'Wave action',slot:'action',price:8},
  {id:'mat',name:'小背景垫',nameEn:'Pet mat',slot:'background',price:8},
  {id:'dog-copper',name:'铜色小狗',nameEn:'Copper dog',slot:'skin',price:12,character:'aps-dog'},
].map(Object.freeze));
// Versioned local rule data; neither the renderer nor event payload chooses values.
export const PET_RULES = Object.freeze({schema:1,version:1,dailyActivityXp:8,
  levelBaseXp:20,levelIncrementXp:10,
  rewards:Object.freeze({
    'live-turn-activity':Object.freeze({xp:1,coins:0}),
    'criterion-auto-verified':Object.freeze({xp:5,coins:2}),
    'criterion-human-accepted':Object.freeze({xp:8,coins:3}),
  })});
