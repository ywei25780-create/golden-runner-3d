export class PlayExperience {
  constructor(){this.mode=null;this.pickerOpen=true;}
  choose(mode){if(!['mobile','desktop'].includes(mode))return false;this.mode=mode;this.pickerOpen=false;return true;}
  openPicker(){this.pickerOpen=true;}
  get allowsPlay(){return !!this.mode&&!this.pickerOpen;}
}

export function renderProfile(mode,devicePixelRatio=1){
  return {pixelRatio:Math.min(Math.max(1,devicePixelRatio),mode==='mobile'?1.35:1.8),shadowSize:mode==='mobile'?1024:2048};
}
