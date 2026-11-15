/** 16×16 pixel-art sprites as character maps. '.' is transparent. */
export const PALETTE: Record<string, string> = {
  k: '#1a1024', w: '#f4efe6', g: '#9a93ad', d: '#4a4560', v: '#120a1e', s: '#f2c29b',
  r: '#d6454f', R: '#8c2634', b: '#4a7bd0', B: '#2c4a8c', y: '#f5c542', Y: '#b98a1d',
  n: '#8a5a3a', N: '#5b3a24', G: '#5fbf4a', h: '#2f7a35', p: '#8a4fd6', c: '#5fd6e0', o: '#f08a3c'
};

export const SPRITE_SIZE = 16;
const E = '................';

export const SPRITES: Record<string, string[]> = {
  player: [
    E, '.....rrrr.......', '....kggggk......', '...kggggggk.....', '...kggggggk.....', '...kgssssgk.....',
    '...kskssksk.....', '...kgssssgk.....', '....kkssskk.....', '...kbbbbbbk.....', '..kbbyybbbbk....',
    '..kbbbbbbbbk....', '..ksbbbbbbsk....', '...kBBkkBBk.....', '...kBBk.kBBk....', '...kkkk.kkkk....'
  ],
  goblin: [
    E, E, '..k..........k..', '.kGk.kkkkkk.kGk.', '..kGkGGGGGGkGk..', '...kGGGGGGGGk...',
    '...kGyrGGryGk...', '...kGGGGGGGGk...', '...kGGkwwkGGk...', '....kkGGGGkk....', '...knnnnnnnnk...',
    '..kGknnnnnnkGk..', '...kknnnnnnkk...', '....kNNkkNNk....', '....kGGk.kGGk...', '....kkkk.kkkk...'
  ],
  skeleton: [
    E, '.....kkkkkk.....', '....kwwwwwwk....', '...kwwwwwwwwk...', '...kwrkwwkrwk...', '...kwkkwwkkwk...',
    '...kwwwkkwwwk...', '....kwkwkwkwk...', '.....kkkkkkk....', '......kwwk......', '....kwwwwwwk....',
    '...kwkkwwkkwk...', '...kwwwwwwwwk...', '....kwkkkkwk....', '....kwk..kwk....', '....kkk..kkk....'
  ],
  chest: [
    E, E, E, E, E, '..kkkkkkkkkkkk..', '.kNnnnnnnnnnnNk.', '.kNnnnnnnnnnnNk.', '.kyyyyyyyyyyyyk.',
    '.kNnnnyyyynnnNk.', '.kNnnnyYYynnnNk.', '.kNnnnnnnnnnnNk.', '.kNNNNNNNNNNNNk.', '..kkkkkkkkkkkk..', E, E
  ],
  chestOpen: [
    E, E, E, '..kkkkkkkkkkkk..', '.kNnnnnnnnnnnNk.', '.kNnnnnnnnnnnNk.', '.kNNNNNNNNNNNNk.', '..kkkkkkkkkkkk..',
    '.kyyyyyyyyyyyyk.', '.kyYyyYyyyYyyyk.', '.kNyyyyyyyyyyNk.', '.kNnnnnnnnnnnNk.', '.kNnnnnnnnnnnNk.',
    '.kNNNNNNNNNNNNk.', '..kkkkkkkkkkkk..', E
  ],
  door: [
    'kkkkkkkkkkkkkkkk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk',
    'kggggggggggggggk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnyNk', 'kNnnnnnNNnnnnYNk', 'kNnnnnnNNnnnnnNk',
    'kNnnnnnNNnnnnnNk', 'kggggggggggggggk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kkkkkkkkkkkkkkkk'
  ],
  doorLocked: [
    'kkkkkkkkkkkkkkkk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk',
    'kggggggggggggggk', 'kNnnnnrrrrrrnnNk', 'kNnnnnrYYYYrnnNk', 'kNnnnnrrrrrrnnNk', 'kNnnnnnNNnnnnnNk',
    'kNnnnnnNNnnnnnNk', 'kggggggggggggggk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kNnnnnnNNnnnnnNk', 'kkkkkkkkkkkkkkkk'
  ],
  doorOpen: [
    'kkkkkkkkkkkkkkkk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk',
    'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk',
    'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kNvvvvvvvvvvvvNk', 'kkkkkkkkkkkkkkkk'
  ],
  trap: [
    E, E, E, E, E, '...w...w...w....', '..kgk.kgk.kgk...', '..kgk.kgk.kgk...', '..kgk.kgk.kgk...',
    '.kkgkkkgkkkgkk..', '.kdddddddddddk..', '..kkkkkkkkkkk...', E, E, E, E
  ],
  potion: [
    E, E, E, E, E, '......knk.......', '......kwk.......', '......kwk.......', '.....kwrrwk.....',
    '....krrrrrrk....', '....krrwrrrk....', '....krrrrrrk....', '....kRRRRRRk....', '.....kkkkkk.....', E, E
  ],
  key: [
    E, E, E, E, E, '....kkkk........', '...kyyyyk.......', '...kyk.kyk......', '...kyyyyk.......', '....kkyk........',
    '......kyk.......', '......kyk.......', '......kyyk......', '......kyk.......', '......kyyk......', '......kkk.......'
  ],
  shield: [
    E, E, E, E, '....kkkkkkkk....', '...kbbbbbbbbk...', '...kbbyyyybbk...', '...kbbbyybbbk...', '...kbbbyybbbk...',
    '...kbbyyyybbk...', '....kbbbbbbk....', '.....kbbbbk.....', '......kbbk......', '.......kk.......', E, E
  ],
  exit: [
    'kkkkkkkkkkkkkkkk', 'kvvvvvvvvvvvvvvk', 'kvvvppppppppvvvk', 'kvvppccccccppvvk', 'kvvpcccwwcccpvvk',
    'kvppccwwwwccppvk', 'kvpccwwyywwccpvk', 'kvpcwwyyyywwcpvk', 'kvpcwwyyyywwcpvk', 'kvpccwwyywwccpvk',
    'kvppccwwwwccppvk', 'kvvpcccwwcccpvvk', 'kvvppccccccppvvk', 'kvvvppppppppvvvk', 'kvvvvvvvvvvvvvvk', 'kkkkkkkkkkkkkkkk'
  ]
};

export const ITEM_SPRITE: Record<string, string> = {
  health_potion: 'potion', dungeon_key: 'key', wooden_shield: 'shield', iron_sword: 'key'
};
