
export function choosePartyFit(candidates,width,height) {
  let best;
  for(const candidate of candidates) {
    const scale=Math.min(1,width/Math.max(1,candidate.width),height/Math.max(1,candidate.height));
    if(!best || scale>best.scale+0.0001)best={...candidate,scale};
  }
  return best;
}
