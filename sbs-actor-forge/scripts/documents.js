// v0.4.0 emitted this one activity ID with 17 characters. Repair that exact
// generated value, while rejecting other invalid IDs instead of guessing.
const LEGACY_ACTIVITY_ID='sbsSourceAct00001';
const ACTIVITY_ID='sbsSourceAct0001';
const validID=value=>typeof value==='string' && /^[A-Za-z0-9]{16}$/.test(value);

function repairReferences(value) {
  if(typeof value==='string') {
    if(value===LEGACY_ACTIVITY_ID)return ACTIVITY_ID;
    return value.replace(/\.Activity\.sbsSourceAct00001(?=$|[.#\]])/g,'.Activity.'+ACTIVITY_ID);
  }
  if(Array.isArray(value))return value.map(repairReferences);
  if(value && typeof value==='object')for(const key of Object.keys(value))value[key]=repairReferences(value[key]);
  return value;
}

export function normalizeItemDocument(item,warnings=[]) {
  const activities=item.system?.activities;
  let repaired=false;
  if(activities && !Array.isArray(activities) && typeof activities==='object') {
    if(Object.hasOwn(activities,LEGACY_ACTIVITY_ID)) {
      if(Object.hasOwn(activities,ACTIVITY_ID))throw Error(`${item.name}: legacy activity ID repair would collide with ${ACTIVITY_ID}`);
      const activity=activities[LEGACY_ACTIVITY_ID];if(!activity || Array.isArray(activity) || typeof activity!=='object')throw Error(`${item.name}: legacy activity must be a native activity object`);delete activities[LEGACY_ACTIVITY_ID];activities[ACTIVITY_ID]=activity;
      if(activity._id===undefined || activity._id===LEGACY_ACTIVITY_ID)activity._id=ACTIVITY_ID;
      repaired=true;
    }
    if(activities[ACTIVITY_ID]?._id===LEGACY_ACTIVITY_ID){activities[ACTIVITY_ID]._id=ACTIVITY_ID;repaired=true;}
  }
  if(repaired) {
    repairReferences(item);
    const note=`${item.name}: repaired the v0.4.0 activity ID to Foundry's required 16 characters`;
    if(!warnings.includes(note))warnings.push(note);
  }
  validateItemDocumentIds(item);
  return repaired;
}

export function validateItemDocumentIds(item) {
  const activities=item.system?.activities;
  if(activities!==undefined) {
    if(!activities || Array.isArray(activities) || typeof activities!=='object')throw Error(`${item.name}: activities must be a native activity map`);
    for(const [id,activity]of Object.entries(activities)) {
      if(!validID(id))throw Error(`${item.name}: activity ID ${id} must be exactly 16 alphanumeric characters`);
      if(!activity || typeof activity!=='object')throw Error(`${item.name}: activity ${id} must be a native activity object`);
      if(activity._id!==undefined && (!validID(activity._id) || activity._id!==id))throw Error(`${item.name}: activity _id must match its 16-character map key ${id}`);
    }
  }
  for(const advancement of item.system?.advancement ?? [])if(advancement._id!==undefined && !validID(advancement._id))throw Error(`${item.name}: advancement ID ${advancement._id} must be exactly 16 alphanumeric characters`);
}

export function normalizeActorDocuments(actor,warnings=[]) {
  let repaired=false;
  for(const item of actor.items ?? [])repaired=normalizeItemDocument(item,warnings) || repaired;
  if(repaired)repairReferences(actor);
  return actor;
}
