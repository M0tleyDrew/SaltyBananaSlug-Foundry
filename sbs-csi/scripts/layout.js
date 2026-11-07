// DOM rectangles are screen pixels. Foundry's UI uses CSS layout pixels before
// its interface-scale transform. Keep those coordinate systems separate.
export function heightInLayoutPixels(screenSpan,layoutHeight,screenHeight){
  const scale=layoutHeight>0&&screenHeight>0?screenHeight/layoutHeight:1;
  return Math.max(0,screenSpan)/(Number.isFinite(scale)&&scale>.01?scale:1);
}
export function measuredScale(node){
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  let layoutHeight=parseFloat(style.height);
  if(Number.isFinite(layoutHeight)&&style.boxSizing!=='border-box')for(const key of ['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'])layoutHeight+=parseFloat(style[key])||0;
  if(!Number.isFinite(layoutHeight)||layoutHeight<=0)layoutHeight=node.offsetHeight;
  return {rect,layoutHeight,scaleY:layoutHeight>0?rect.height/layoutHeight:1};
}
export function availableHeight(node,screenBottom){
  const {rect,layoutHeight}=measuredScale(node);
  return heightInLayoutPixels(screenBottom-rect.top,layoutHeight,rect.height).toFixed(3)+'px';
}
