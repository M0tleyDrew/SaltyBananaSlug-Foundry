import {makeDeck, shuffle, evaluateFive, SUITS, cardText} from "./engine.js";
export const EXTRA_TYPES = ["euchre", "baccarat", "war", "video", "slots"];
export const SLOT_SYMBOLS = ["Cherry", "Lemon", "Bell", "Banana", "Joker", "Seven"];
// Twenty equally likely stops per reel. Only three matching symbols pay, total return including stake.
export const SLOT_REEL = [0,0,0,0,0,0,0,0,1,1,1,1,1,2,2,2,3,3,4,5];
export const SLOT_RETURNS = [8, 12, 25, 50, 100, 500];
export const VIDEO_RETURNS = [0,1,2,3,4,6,9,25,50];
export function videoReturn(cards) {
  const e = evaluateFive(cards);
  return e.label === "Royal Flush" ? 800 : e.category === 1 && e.tiebreak[0] < 11 ? 0 : VIDEO_RETURNS[e.category];
}
const pop = s => { if (!s.deck.length) throw new Error("Deck exhausted."); return s.deck.pop(); };
const next = (s, i) => {for(let n=1;n<=4;n++){const j=(i+n)%4;if(j!==s.sittingOut)return j;}return -1;};
const color = suit => ["s","c"].includes(suit) ? "black" : "red";
export function effectiveSuit(card, trump) {return card.rank === "X" || (card.rank === "J" && color(card.suit)===color(trump)) ? trump : card.suit;}
export function euchreStrength(card, trump, led) {
  if(card.rank==="X")return 100;
  if(card.rank==="J" && card.suit===trump)return 99;
  if(card.rank==="J" && effectiveSuit(card,trump)===trump)return 98;
  return (effectiveSuit(card,trump)===trump ? 50 : card.suit===led ? 20 : 0)+card.value;
}
function stakeMatch(s) {
  const stake=s.settings.matchStake;
  if(s.seats.some(p=>p.chips<stake))throw new Error("Every Euchre seat needs enough chips for the match stake.");
  s.seats.forEach(p=>{p.chips-=stake;p.committed=stake;});s.scores=[0,0];s.matchFinished=false;
}
export function startExtra(s) {
  if(s.type==="euchre") {
    if(s.seats.length!==4)throw new Error("Euchre requires exactly four seats. Opposite seats are partners.");
    if(!s.scores || s.matchFinished)stakeMatch(s);
    s.handNumber++;s.dealerIndex=(s.dealerIndex+1)%4;s.deck=shuffle(makeDeck().filter(c=>c.value>=9));
    if(s.settings.euchreJoker)s.deck.push({id:"X",rank:"X",suit:"j",value:15,art:Math.random()<.5?"joker-red.png":"joker-black.png"}),shuffle(s.deck);
    s.seats.forEach(p=>{p.hand=[];p.lastAction="";});
    for(const count of [3,2])for(let n=1;n<=4;n++)for(let k=0;k<count;k++)s.seats[(s.dealerIndex+n)%4].hand.push(pop(s));
    s.upcard=pop(s);s.community=[];s.trump=null;s.maker=-1;s.sittingOut=-1;s.trick=[];s.lastTrick=[];s.tricks=[0,0];s.bidRound=1;s.passes=0;
    s.phase="euchre-bid";s.round="Choose trump";s.currentSeatIndex=next(s,s.dealerIndex);s.results=[];
    s.log=[`Euchre hand ${s.handNumber}. Seats 1 & 3 vs 2 & 4. Dealer: ${s.seats[s.dealerIndex].name}.`];
    // A joker upcard is replaced: the optional highest-trump joker has no natural suit to order up.
    if(s.upcard.rank==="X"){s.deck.unshift(s.upcard);s.upcard=pop(s);}
  } else {
    s.handNumber++;s.phase="betting";s.round="Place bets";s.currentSeatIndex=-1;s.results=[];s.log=[`${s.name} round ${s.handNumber}.`];s.community=[];s.dealerCards=[];s.sharedDeal=null;s.deck=s.type==="war"?shuffle(makeDeck()):s.type==="baccarat"?shuffle(Array.from({length:8},(_,n)=>makeDeck().map(c=>({...c,id:`${c.id}-${n}`}))).flat()):[];
    s.seats.forEach(p=>{p.hand=[];p.betLocked=false;p.extra=null;p.committed=0;p.lastAction=p.chips>=s.settings.minBet?"Place a bet":"Out of chips";});
    if(!s.seats.some(p=>p.chips>=s.settings.minBet)){s.phase="game-over";s.results=[{text:"No seat can cover the minimum bet."}];}
  }
  return s;
}
function beginTricks(s) {s.phase="euchre-play";s.round="Play tricks";s.currentSeatIndex=next(s,s.dealerIndex);}
function finishEuchreHand(s) {
  const makerTeam=s.maker%2, t=s.tricks[makerTeam];
  const winner=t>=3?makerTeam:1-makerTeam;
  const points=t<3?2:t===5?(s.sittingOut>=0?4:2):1;
  s.scores[winner]+=points;s.phase="complete";s.currentSeatIndex=-1;
  s.results=[{text:`Team ${winner+1} scores ${points}. Match: ${s.scores.join(" – ")}.`}];
  if(s.scores[winner]>=10){s.matchFinished=true;s.seats.forEach((p,i)=>{if(i%2===winner)p.chips+=s.settings.matchStake*2;p.committed=0;});s.results.push({text:`Team ${winner+1} wins the match and the stakes.`});}
}
export function euchreAction(s, seatId, action, value, alone=false) {
  const i=s.seats.findIndex(p=>p.id===seatId), p=s.seats[i];
  if(i!==s.currentSeatIndex || !p)throw new Error("It is not that seat's turn.");
  if(s.phase==="euchre-bid") {
    if(action==="pass") {
      if(s.settings.stickDealer && s.bidRound===2 && i===s.dealerIndex)throw new Error("Stick the dealer: choose trump.");
      if(++s.passes===4){if(s.bidRound===1){s.bidRound=2;s.passes=0;}else {s.phase="complete";s.results=[{text:"All passed. Redeal with the next dealer; stakes remain in the match."}];s.currentSeatIndex=-1;return s;}}
      s.currentSeatIndex=next(s,i);return s;
    }
    if(action!=="trump" || !SUITS.some(t=>t.id===value) || (s.bidRound===1 ? value!==s.upcard.suit : value===s.upcard.suit))throw new Error("Choose a legal trump suit.");
    s.trump=value;s.maker=i;s.sittingOut=alone?(i+2)%4:-1;s.log.push(`${p.name} calls ${SUITS.find(t=>t.id===value).name}${alone?" alone":""}.`);
    if(s.bidRound===1){s.seats[s.dealerIndex].hand.push(s.upcard);s.phase="euchre-discard";s.round="Dealer discards";s.currentSeatIndex=s.dealerIndex;}else beginTricks(s);
  } else if(s.phase==="euchre-discard") {
    const n=Number(value);if(action!=="discard" || !Number.isInteger(n)||n<0||n>=p.hand.length)throw new Error("Choose one card to discard.");
    p.hand.splice(n,1);beginTricks(s);
  } else if(s.phase==="euchre-play") {
    const n=Number(value), c=p.hand[n];if(action!=="play" || !Number.isInteger(n)||!c)throw new Error("Choose a card.");
    const led=s.trick.length?effectiveSuit(s.trick[0].card,s.trump):null;
    if(led && effectiveSuit(c,s.trump)!==led && p.hand.some(x=>effectiveSuit(x,s.trump)===led))throw new Error("You must follow suit. The left bower belongs to trump.");
    p.hand.splice(n,1);s.trick.push({index:i,card:c});
    if(s.trick.length===(s.sittingOut>=0?3:4)) {
      const lead=effectiveSuit(s.trick[0].card,s.trump);
      const win=s.trick.reduce((a,b)=>euchreStrength(a.card,s.trump,lead)>euchreStrength(b.card,s.trump,lead)?a:b);
      s.tricks[win.index%2]++;s.lastTrick=s.trick;s.trick=[];s.currentSeatIndex=win.index;s.log.push(`${s.seats[win.index].name} takes the trick.`);
      if(s.tricks[0]+s.tricks[1]===5)finishEuchreHand(s);
    } else s.currentSeatIndex=next(s,i);
  } else throw new Error("Euchre action not available.");
  return s;
}
const baccaratValue=c=>c.rank==="A"?1:c.value>=10?0:c.value;
export const baccaratTotal=cards=>cards.reduce((v,c)=>v+baccaratValue(c),0)%10;
export function bankerDraw(total, third) {
  if(third===null)return total<=5;
  return total<=2 || total===3&&third!==8 || total===4&&third>=2&&third<=7 || total===5&&third>=4&&third<=7 || total===6&&third>=6&&third<=7;
}
function finishSeat(s,p,returned,text){p.chips+=returned;p.extra.returned=returned;p.extra.done=true;p.lastAction=text;s.results.push({text:`${p.name}: ${text}`});s.log.push(`${p.name}: ${text}`);if(s.seats.filter(p=>p.chips>=s.settings.minBet||p.betLocked).every(p=>p.betLocked&&p.extra?.done))s.phase="complete",s.round="Results";}
// Shared table games wait for every funded seat before exposing an outcome.
function dealShared(s) {
  const players=s.seats.filter(p=>p.betLocked);
  if(s.type==="war") {
    s.dealerCards=[pop(s)];s.phase="war-choice";s.round="War decisions";
    for(const p of players){
      p.hand=[pop(s)];p.extra.dealer=structuredClone(s.dealerCards);
      const diff=p.hand[0].value-s.dealerCards[0].value;
      if(diff===0)p.lastAction="Tie: surrender half or match the stake to go to war.";
      else finishSeat(s,p,diff>0?p.extra.bet*2:0,diff>0?`Wins ${p.extra.bet}.`:`Loses ${p.extra.bet}.`);
    }
  } else {
    const player=[pop(s)],banker=[pop(s)];player.push(pop(s));banker.push(pop(s));
    let a=baccaratTotal(player),b=baccaratTotal(banker),third=null;
    if(a<8&&b<8){if(a<=5){const c=pop(s);player.push(c);third=baccaratValue(c);}if(bankerDraw(b,third))banker.push(pop(s));}
    a=baccaratTotal(player);b=baccaratTotal(banker);const winner=a===b?"tie":a>b?"player":"banker";
    s.sharedDeal={player,banker};s.deck=[];
    for(const p of players){
      const {bet,choice}=p.extra;p.extra.player=structuredClone(player);p.extra.banker=structuredClone(banker);
      const multiple=winner===choice?(choice==="banker"?1.95:choice==="tie"?9:2):winner==="tie"&&choice!=="tie"?1:0;
      const returned=Math.round(bet*multiple*100)/100;
      finishSeat(s,p,returned,`${a} Player / ${b} Banker — ${winner}; ${choice} bet returns ${returned}.`);
    }
  }
}
function resolveSharedWar(s) {
  const tied=s.seats.filter(p=>p.extra&&!p.extra.done);
  if(!tied.length||tied.some(p=>!p.extra.warChoice))return;
  for(let n=0;n<3;n++)pop(s);
  s.dealerCards.push(pop(s));
  for(const p of s.seats.filter(p=>p.betLocked))p.extra.dealer=structuredClone(s.dealerCards);
  for(const p of tied){
    const bet=p.extra.bet;p.hand.push(pop(s));
    const diff=p.hand[1].value-s.dealerCards[1].value;
    finishSeat(s,p,diff>0?bet*3:diff===0?bet*4:0,diff>=0?`War won; returns ${diff===0?bet*4:bet*3} on ${bet*2} total stake.`:`War lost ${bet*2}.`);
  }
  s.deck=[];
}
export function extraAction(s, seatId, action, amount, value, alone=false) {
  if(!EXTRA_TYPES.includes(s.type))throw new Error("Invalid game action for this table.");
  if(s.type==="euchre")return euchreAction(s,seatId,action,value,alone);
  const p=s.seats.find(p=>p.id===seatId);if(!p)throw new Error("Seat not found.");
  if(["complete","game-over"].includes(s.phase))throw new Error("Start the next round.");
  if(action==="bet") {
    if(["war","baccarat"].includes(s.type)&&s.phase!=="betting")throw new Error("Betting has closed.");
    if(p.betLocked)throw new Error("Bet already placed.");
    const bet=Number(amount);if(!Number.isSafeInteger(bet)||bet<s.settings.minBet||bet>Math.min(p.chips,s.settings.maxBet))throw new Error("Bet outside table limits.");
    if(s.type==="baccarat" && !["player","banker","tie"].includes(value))throw new Error("Choose Player, Banker or Tie.");
    p.betLocked=true;p.chips-=bet;p.extra={bet,done:false};
    if(["war","baccarat"].includes(s.type)){
      p.extra.choice=value;p.lastAction="Bet locked; waiting for the other bets.";
      if(s.seats.every(seat=>seat.betLocked||seat.chips<s.settings.minBet))dealShared(s);
      return s;
    }
    // Each casino seat gets an independent hand/spin; no one can see the next seat's outcome in advance.
    s.deck=shuffle(makeDeck());
    if(s.type==="slots") {
      const reels=Array.from({length:3},()=>SLOT_REEL[Math.floor(Math.random()*SLOT_REEL.length)]);p.extra.reels=reels;
      const multiplier=reels.every(x=>x===reels[0])?SLOT_RETURNS[reels[0]]:0;
      finishSeat(s,p,bet*multiplier,`${reels.map(i=>SLOT_SYMBOLS[i]).join(" ")} — returns ${bet*multiplier} (stake ${bet}).`);
    } else if(s.type==="video") {
      p.hand=Array.from({length:5},()=>pop(s));p.extra.deck=s.deck;s.deck=[];p.lastAction="Select cards to KEEP, then draw once.";
    }
    s.deck=[];
  } else {
    if(!p.extra || p.extra.done)throw new Error("Place a bet first.");
    if(s.type==="war") {
      const bet=p.extra.bet;
      if(s.phase!=="war-choice"||!p.hand.length||p.extra.warChoice)throw new Error("Wait for the deal or the other war decisions.");
      if(action==="surrender")finishSeat(s,p,bet/2,`Surrender: loses ${bet/2}.`);
      else if(action==="war") {
        if(p.chips<bet)throw new Error("Not enough chips to match the war stake.");
        p.chips-=bet;p.extra.additionalBet=bet;p.extra.warChoice=true;
        p.lastAction="War stake locked; waiting for the other decisions.";
      }else throw new Error("Surrender or go to war.");
      resolveSharedWar(s);
    } else if(s.type==="video" && action==="draw") {
      if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(n=>!Number.isInteger(n)||n<0||n>4))throw new Error("Invalid held cards.");
      const held=new Set(value);s.deck=p.extra.deck;p.extra.deck=[];
      p.hand=p.hand.map((c,n)=>held.has(n)?c:pop(s));s.deck=[];
      const mult=videoReturn(p.hand);finishSeat(s,p,p.extra.bet*mult,`${evaluateFive(p.hand).label}; returns ${mult}× stake (${p.extra.bet*mult}).`);
    } else throw new Error("Invalid casino action.");
  }
  return s;
}
export function extraView(s,userId) {
  const own=s.seats.filter(p=>p.ownerUserId===userId).map(p=>p.id);
  return {id:s.id,revision:s.revision??0,type:s.type,name:s.name,hostUserId:s.hostUserId,settings:{...s.settings},phase:s.phase,round:s.round,handNumber:s.handNumber,log:s.log.slice(-24),results:structuredClone(s.results),ownSeatIds:own,actions:{},dealerIndex:s.dealerIndex,community:[],dealerCards:structuredClone(s.dealerCards??[]),sharedDeal:structuredClone(s.sharedDeal??null),pot:s.seats.reduce((n,p)=>n+p.committed,0),currentSeatIndex:s.currentSeatIndex,
    scores:s.scores,tricks:s.tricks,trump:s.trump,bidRound:s.bidRound,upcard:s.upcard,trick:s.trick,lastTrick:s.lastTrick,matchFinished:s.matchFinished,sittingOut:s.sittingOut,
    seats:s.seats.map((p,i)=>({id:p.id,name:p.name,ownerUserId:p.ownerUserId,avatar:p.avatar,actorId:p.actorId,chips:p.chips,own:own.includes(p.id),current:i===s.currentSeatIndex,cardCount:p.hand.length,cards:own.includes(p.id)||s.type==="war"?structuredClone(p.hand):null,lastAction:p.lastAction,betLocked:p.betLocked,
      extra:p.extra?Object.fromEntries(Object.entries(p.extra).filter(([k])=>k!=="deck")):null}))};
}
