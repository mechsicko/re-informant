// How a real re:gen's traits turn into a fighter.
// type = the collection's Type trait (sets the special move)
// style = read from the Eyes trait. These pairings are a game-design call, easy to change here.
const TYPE = {
  'type 1': 'human', 'type 2': 'human', 'type 3': 'human',
  robot: 'robot', 're:bot': 'rebot', gold: 'gold', ape: 'ape', alien: 'alien', zombie: 'zombie',
  ghost: 'ghost', bones: 'bones', mummy: 'mummy', demoness: 'demoness', celestial: 'celestial',
};
const EYES = {
  lasers: 'BRUISER', evil: 'BRUISER', scar: 'BRUISER', cyclops: 'BRUISER',
  sleep: 'TANK', 'crash test dummy': 'TANK',
  sus: 'TRICKSTER', punk: 'TRICKSTER', 'punk(left)': 'TRICKSTER', 'punk(right)': 'TRICKSTER',
  left: 'HUSTLER', right: 'HUSTLER',
  white: 'COUNTER', black: 'GAMBLER',
};
const STYLES = ['BRUISER', 'COUNTER', 'HUSTLER', 'TRICKSTER', 'TANK', 'GAMBLER'];

export function fighterFromTraits(attributes = {}, tokenId = 0) {
  const type = TYPE[attributes.type] || 'human';
  // "normal" eyes and the 1 of 1s (no traits) get a style picked from the token number
  const style = EYES[attributes.eyes] || STYLES[((tokenId * 2654435761) >>> 0) % STYLES.length];
  return { type, style };
}
