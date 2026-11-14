
function screenPoint(viewport,screen,point) {
  return {x:(point.x-viewport.left)*screen[0]/viewport.width,y:(point.y-viewport.top)*screen[1]/viewport.height};
}
export function fitView(rect,bounds,viewport,screen,position) {
  const center=screenPoint(viewport,screen,{x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2});
  const width=Math.max(1,bounds.right-bounds.left)*screen[0]/viewport.width;
  const height=Math.max(1,bounds.bottom-bounds.top)*screen[1]/viewport.height;
  const scale=Math.min(width/(rect.width*1.24),height/(rect.height*1.24));
  return {scale,x:rect.x+rect.width/2+(position.x-center.x)/scale,y:rect.y+rect.height/2+(position.y-center.y)/scale};
}
export function zoomView(stage,viewport,screen,anchor,scale) {
  const point=screenPoint(viewport,screen,anchor);
  return {scale,
    x:stage.pivot.x+(point.x-stage.position.x)*(1/stage.scale.x-1/scale),
    y:stage.pivot.y+(point.y-stage.position.y)*(1/stage.scale.y-1/scale)};
}
export function dragView(stage,viewport,screen,dx,dy) {
  return {x:stage.pivot.x-dx*screen[0]/viewport.width/stage.scale.x,
    y:stage.pivot.y-dy*screen[1]/viewport.height/stage.scale.y};
}
