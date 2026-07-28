// Canonical role registry types and role definitions for TOS LLMs.
// This is now structured as a discriminated union keyed by faction with faction-specific subalignments.

export type Faction = "Town" | "Mafia" | "Coven" | "Neutral";

export type TownSubalignment = "Investigative" | "Protective" | "Support" | "Killing" | "Power";
export type MafiaSubalignment = "Deception" | "Utility" | "Killing" | "Support";
export type CovenSubalignment = "Evil";
export type NeutralSubalignment = "Benign" | "Evil" | "Chaos" | "Killing" | "Apocalypse";

export type Subalignment = TownSubalignment | MafiaSubalignment | CovenSubalignment | NeutralSubalignment;

export interface BaseRoleDef {
  name: string;
  winCondition: string;
  defense: "None" | "Basic" | "Powerful" | "Unstoppable";
  attack: "None" | "Basic" | "Powerful" | "Unstoppable";
  dayAbility?: string;
  nightAbility?: string;
  hasFactionChat: boolean;
  canConvert: boolean;
  description: string;
  mechanics: {
    roleblockImmune?: boolean;
    controlImmune?: boolean;
    detectionImmune?: boolean;
    charges?: number;
    cooldown?: number;
    specialInteraction?: string;
    canSelfTarget?: boolean;
  };
}

export interface TownRoleDef extends BaseRoleDef {
  faction: "Town";
  subalignment: TownSubalignment;
}

export interface MafiaRoleDef extends BaseRoleDef {
  faction: "Mafia";
  subalignment: MafiaSubalignment;
}

export interface CovenRoleDef extends BaseRoleDef {
  faction: "Coven";
  subalignment: CovenSubalignment;
}

export interface NeutralRoleDef extends BaseRoleDef {
  faction: "Neutral";
  subalignment: NeutralSubalignment;
}

export type RoleDef = TownRoleDef | MafiaRoleDef | CovenRoleDef | NeutralRoleDef;

export const roleRegistry = {
  // --- TOWN ROLES (22 Roles) ---
  Bodyguard: {
    faction: "Town",
    subalignment: "Protective",
    name: "Bodyguard",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Powerful",
    nightAbility: "Protect one player from attacks. Vest yourself once.",
    hasFactionChat: false,
    canConvert: false,
    description: "Guard a target at night. If they are attacked, you fight back, killing the attacker and dying yourself.",
    mechanics: { charges: 1, canSelfTarget: true }
  },
  Doctor: {
    faction: "Town",
    subalignment: "Protective",
    name: "Doctor",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Heal one player, granting them Powerful defense. Self-heal once.",
    hasFactionChat: false,
    canConvert: false,
    description: "Heal a target, preventing them from dying of Basic/Powerful attacks. You learn if they were attacked.",
    mechanics: { charges: 1, canSelfTarget: true }
  },
  Escort: {
    faction: "Town",
    subalignment: "Support",
    name: "Escort",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Distract one player to block their night action.",
    hasFactionChat: false,
    canConvert: false,
    description: "Roleblock a player, preventing their ability from executing.",
    mechanics: { roleblockImmune: true }
  },
  "Tavern Keeper": {
    faction: "Town",
    subalignment: "Support",
    name: "Tavern Keeper",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Serve drinks to roleblock a player.",
    hasFactionChat: false,
    canConvert: false,
    description: "Keep a player busy, roleblocking their night action.",
    mechanics: { roleblockImmune: true }
  },
  Jailor: {
    faction: "Town",
    subalignment: "Power",
    name: "Jailor",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Unstoppable",
    dayAbility: "Select a player to jail tonight.",
    nightAbility: "Interrogate and optionally execute your prisoner.",
    hasFactionChat: false,
    canConvert: false,
    description: "Jail a player. They are roleblocked, protected from all actions, and you can chat privately with them and execute them.",
    mechanics: { charges: 3, roleblockImmune: true, controlImmune: true }
  },
  Lookout: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Lookout",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Watch a target to see who visits them.",
    hasFactionChat: false,
    canConvert: false,
    description: "Observe a target player at night. You will get a list of names of everyone who visited them.",
    mechanics: {}
  },
  Mayor: {
    faction: "Town",
    subalignment: "Power",
    name: "Mayor",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    dayAbility: "Reveal yourself as Mayor to gain 3 votes instead of 1.",
    hasFactionChat: false,
    canConvert: false,
    description: "You cannot whisper or be whispered to after revealing. Your vote count becomes 3.",
    mechanics: {}
  },
  Medium: {
    faction: "Town",
    subalignment: "Support",
    name: "Medium",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Speak with the dead during the night. Seance once after death.",
    hasFactionChat: false,
    canConvert: false,
    description: "Chat privately with dead players during the night to gather clues.",
    mechanics: { charges: 1 }
  },
  Retributionist: {
    faction: "Town",
    subalignment: "Support",
    name: "Retributionist",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Reanimate a dead Town player to use their ability.",
    hasFactionChat: false,
    canConvert: false,
    description: "Use the corpse of a dead Town member to perform their action on a target.",
    mechanics: {}
  },
  Sheriff: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Sheriff",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Interrogate a player to check for suspicious activity.",
    hasFactionChat: false,
    canConvert: false,
    description: "Check if a player is suspicious (members of Mafia, Coven, or certain Neutrals).",
    mechanics: {}
  },
  Spy: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Spy",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Bug a player's house and listen to Mafia/Coven targets.",
    hasFactionChat: false,
    canConvert: false,
    description: "Listen in on night visits. You see who Mafia/Coven visited and can detect minor bugs on a target.",
    mechanics: {}
  },
  Transporter: {
    faction: "Town",
    subalignment: "Support",
    name: "Transporter",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Swap the seats/positions of two players.",
    hasFactionChat: false,
    canConvert: false,
    description: "Choose two players. Any action targeting Player A will land on Player B, and vice-versa.",
    mechanics: { controlImmune: true }
  },
  "Vampire Hunter": {
    faction: "Town",
    subalignment: "Killing",
    name: "Vampire Hunter",
    winCondition: "Eliminate all Vampires and other evils.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Check a house for Vampires, staking them if found.",
    hasFactionChat: false,
    canConvert: false,
    description: "Check a target. If they are a Vampire, they die. If they visit you, they also die.",
    mechanics: {}
  },
  Veteran: {
    faction: "Town",
    subalignment: "Killing",
    name: "Veteran",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Powerful",
    nightAbility: "Go on alert, shooting anyone who visits you.",
    hasFactionChat: false,
    canConvert: false,
    description: "Go on alert up to 3 times. While on alert, you have Basic defense and shoot everyone who visits you.",
    mechanics: { charges: 3, roleblockImmune: true, controlImmune: true, canSelfTarget: true }
  },
  Vigilante: {
    faction: "Town",
    subalignment: "Killing",
    name: "Vigilante",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Shoot a target player. Suicide the next day if you kill a Town member.",
    hasFactionChat: false,
    canConvert: false,
    description: "Take justice into your own hands. You have 3 bullets to shoot suspicious players.",
    mechanics: { charges: 3 }
  },
  Crusader: {
    faction: "Town",
    subalignment: "Protective",
    name: "Crusader",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Protect a player, attacking one random visitor and granting target defense.",
    hasFactionChat: false,
    canConvert: false,
    description: "Guard a player's house. You grant them Powerful defense but attack one visitor (friend or foe).",
    mechanics: {}
  },
  Tracker: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Tracker",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Track a target to see who they visit.",
    hasFactionChat: false,
    canConvert: false,
    description: "Follow a player at night to reveal who they targeted with their night action.",
    mechanics: {}
  },
  Trapper: {
    faction: "Town",
    subalignment: "Protective",
    name: "Trapper",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Build or dismantle a trap on a player's house.",
    hasFactionChat: false,
    canConvert: false,
    description: "Spend 1 night building a trap. The next night you can deploy it to shield a target and damage/roleblock attackers.",
    mechanics: {}
  },
  Psychic: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Psychic",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Receive visions of good or evil players.",
    hasFactionChat: false,
    canConvert: false,
    description: "Get a vision on odd nights showing 3 players (at least 1 is evil), or even nights showing 2 players (at least 1 is good).",
    mechanics: {}
  },
  Investigator: {
    faction: "Town",
    subalignment: "Investigative",
    name: "Investigator",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    nightAbility: "Investigate a player to determine their role alignment.",
    hasFactionChat: false,
    canConvert: false,
    description: "Examine a player to receive their specific ToS role clues.",
    mechanics: {}
  },
  Monarch: {
    faction: "Town",
    subalignment: "Power",
    name: "Monarch",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "None",
    dayAbility: "Knight a player, granting them an extra vote and defense.",
    hasFactionChat: false,
    canConvert: false,
    description: "Knight up to two targets. Knighted targets gain an extra vote and Basic defense.",
    mechanics: { charges: 2 }
  },
  Deputy: {
    faction: "Town",
    subalignment: "Killing",
    name: "Deputy",
    winCondition: "Eliminate all evils & neutrals that oppose the Town.",
    defense: "None",
    attack: "Powerful",
    dayAbility: "Shoot a player publicly during the day.",
    hasFactionChat: false,
    canConvert: false,
    description: "Kill a player in broad daylight. If they are Town, you are hung by the town immediately.",
    mechanics: { charges: 1 }
  },

  // --- MAFIA ROLES (12 Roles) ---
  Blackmailer: {
    faction: "Mafia",
    subalignment: "Deception",
    name: "Blackmailer",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Blackmail a player, preventing them from speaking the next day.",
    hasFactionChat: true,
    canConvert: false,
    description: "Shut a player up. They can only type basic blackmailed messages in chat.",
    mechanics: {}
  },
  Consigliere: {
    faction: "Mafia",
    subalignment: "Support", // Faction specific Mafia subalignments: Deception, Utility, Killing, Support
    name: "Consigliere",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Check a target to learn their exact role.",
    hasFactionChat: true,
    canConvert: false,
    description: "Gather expert intelligence, revealing the exact role of your target.",
    mechanics: {}
  },
  Bootlegger: {
    faction: "Mafia",
    subalignment: "Utility",
    name: "Bootlegger",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Deliver drinks to roleblock a player and bypass immunity.",
    hasFactionChat: true,
    canConvert: false,
    description: "A specialized Mafia roleblocker that can bypass roleblock immunities in certain setups.",
    mechanics: { roleblockImmune: true }
  },
  Disguiser: {
    faction: "Mafia",
    subalignment: "Deception",
    name: "Disguiser",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Disguise a Mafia member as another player.",
    hasFactionChat: true,
    canConvert: false,
    description: "Hide the true role and faction of a Mafia member upon death or investigation.",
    mechanics: {}
  },
  Forger: {
    faction: "Mafia",
    subalignment: "Deception",
    name: "Forger",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Forge a player's last will and role upon their death.",
    hasFactionChat: true,
    canConvert: false,
    description: "Rewrite a dead target's final will and alignment clues to mislead the Town.",
    mechanics: { charges: 2 }
  },
  Framer: {
    faction: "Mafia",
    subalignment: "Deception",
    name: "Framer",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Frame a player, making them appear suspicious to Investigators/Sheriffs.",
    hasFactionChat: true,
    canConvert: false,
    description: "Falsify evidence against a target so they check out as evil tonight.",
    mechanics: {}
  },
  Godfather: {
    faction: "Mafia",
    subalignment: "Killing",
    name: "Godfather",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "Basic",
    attack: "Basic",
    nightAbility: "Order the Mafioso to kill a target, or kill them yourself.",
    hasFactionChat: true,
    canConvert: false,
    description: "The leader of the Mafia. Detects as innocent and has Basic defense.",
    mechanics: { detectionImmune: true }
  },
  Janitor: {
    faction: "Mafia",
    subalignment: "Utility",
    name: "Janitor",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Clean a target, hiding their role and last will when they die.",
    hasFactionChat: true,
    canConvert: false,
    description: "Scrub the crime scene. Only you will know the cleaned target's role and last will.",
    mechanics: { charges: 2 }
  },
  Mafioso: {
    faction: "Mafia",
    subalignment: "Killing",
    name: "Mafioso",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Attack a target player.",
    hasFactionChat: true,
    canConvert: false,
    description: "Carry out the Godfather's orders and strike down Town members.",
    mechanics: {}
  },
  Hypnotist: {
    faction: "Mafia",
    subalignment: "Deception",
    name: "Hypnotist",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Inject false feedback/messages into a player's mind.",
    hasFactionChat: true,
    canConvert: false,
    description: "Make a player believe they were healed, roleblocked, or controlled tonight.",
    mechanics: {}
  },
  Ambusher: {
    faction: "Mafia",
    subalignment: "Killing",
    name: "Ambusher",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Lie in wait at a target's house, attacking one visitor.",
    hasFactionChat: true,
    canConvert: false,
    description: "Attack anyone who visits your targeted player. Other visitors will see your name.",
    mechanics: {}
  },
  Consort: {
    faction: "Mafia",
    subalignment: "Support",
    name: "Consort",
    winCondition: "Eliminate the Town and any opposing evils/neutrals.",
    defense: "None",
    attack: "None",
    nightAbility: "Roleblock a target using your distracting charm.",
    hasFactionChat: true,
    canConvert: false,
    description: "The Mafia's answer to the Escort. Keep targets busy all night.",
    mechanics: { roleblockImmune: true }
  },

  // --- COVEN ROLES (12 Roles) ---
  "Coven Leader": {
    faction: "Coven",
    subalignment: "Evil",
    name: "Coven Leader",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "Basic",
    attack: "Basic",
    nightAbility: "Control a player to target someone else. Gain Necronomicon first.",
    hasFactionChat: true,
    canConvert: false,
    description: "Command other players to execute actions of your choosing.",
    mechanics: { controlImmune: true }
  },
  "Potion Master": {
    faction: "Coven",
    subalignment: "Evil",
    name: "Potion Master",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Mix a potion to heal a target, reveal their role, or attack them.",
    hasFactionChat: true,
    canConvert: false,
    description: "Choose between three distinct potions to support Coven or damage Town.",
    mechanics: { cooldown: 1 }
  },
  "Hex Master": {
    faction: "Coven",
    subalignment: "Evil",
    name: "Hex Master",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Apply a hex to a player. If all living non-coven are hexed, kill them all.",
    hasFactionChat: true,
    canConvert: false,
    description: "Place permanent curses on targets. Unleash a final Hex Bomb.",
    mechanics: {}
  },
  Necromancer: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Necromancer",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Summon dead players or ghouls to attack/support.",
    hasFactionChat: true,
    canConvert: false,
    description: "Command deceased targets to trigger their abilities one final time.",
    mechanics: {}
  },
  Poisoner: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Poisoner",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Poison a player, causing them to die at the end of the next day.",
    hasFactionChat: true,
    canConvert: false,
    description: "Delay death. Target is poisoned and will die unless cured by a Doctor.",
    mechanics: {}
  },
  Medusa: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Medusa",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Powerful",
    nightAbility: "Gaze at visitors, turning them to stone, or visit a target to stone them.",
    hasFactionChat: true,
    canConvert: false,
    description: "Turn targets to stone. Stoned targets have their roles and wills obliterated.",
    mechanics: { charges: 3 }
  },
  Witch: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Witch",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "None",
    nightAbility: "Control a player's mind and force them to act on your target.",
    hasFactionChat: true,
    canConvert: false,
    description: "Direct actions. You learn the exact role of the target you control.",
    mechanics: {}
  },
  Enchanter: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Enchanter",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "None",
    nightAbility: "Alter the results of investigations or frame targets.",
    hasFactionChat: true,
    canConvert: false,
    description: "Alter game feedback of target visits, casting powerful illusions.",
    mechanics: {}
  },
  Conjuror: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Conjuror",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "Powerful",
    dayAbility: "Publicly summon a meteor to kill a player during the day.",
    hasFactionChat: true,
    canConvert: false,
    description: "Perform an explosive, unblockable public day execution.",
    mechanics: { charges: 1 }
  },
  "Wildling": {
    faction: "Coven",
    subalignment: "Evil",
    name: "Wildling",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "None",
    nightAbility: "Listen to whispers and track players' movements.",
    hasFactionChat: true,
    canConvert: false,
    description: "An investigative Coven member who intercepts public whispers and target visits.",
    mechanics: {}
  },
  Dreamweaver: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Dreamweaver",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "None",
    nightAbility: "Invade a player's dreams, driving them insane unless visited by Town.",
    hasFactionChat: true,
    canConvert: false,
    description: "Induce madness in Town members. Insane targets vote and act randomly.",
    mechanics: {}
  },
  Illusionist: {
    faction: "Coven",
    subalignment: "Evil",
    name: "Illusionist",
    winCondition: "Eliminate all who oppose the Coven.",
    defense: "None",
    attack: "None",
    nightAbility: "Grant a Coven member an illusion that makes them seem like Town.",
    hasFactionChat: true,
    canConvert: false,
    description: "Cover up Coven members so they detect as good to Sheriffs and Investigators.",
    mechanics: {}
  },

  // --- NEUTRAL ROLES (14 Roles) ---
  Amnesiac: {
    faction: "Neutral",
    subalignment: "Benign",
    name: "Amnesiac",
    winCondition: "Remember a role and fulfill that role's win condition.",
    defense: "None",
    attack: "None",
    nightAbility: "Remember the role of a dead player.",
    hasFactionChat: false,
    canConvert: true,
    description: "You have forgotten who you are. Remember a dead player's role and inherit their faction.",
    mechanics: {}
  },
  Arsonist: {
    faction: "Neutral",
    subalignment: "Killing",
    name: "Arsonist",
    winCondition: "Douse and burn everyone alive.",
    defense: "Basic",
    attack: "Unstoppable",
    nightAbility: "Douse a target, or ignite all doused targets.",
    hasFactionChat: false,
    canConvert: false,
    description: "Quietly douse players in gas. On night of your choosing, ignite them all to bypass defense.",
    mechanics: { roleblockImmune: true }
  },
  Executioner: {
    faction: "Neutral",
    subalignment: "Evil",
    name: "Executioner",
    winCondition: "Get your target lynched on trial.",
    defense: "Basic",
    attack: "None",
    hasFactionChat: false,
    canConvert: false,
    description: "You are assigned a Town target. Force the Town to hang them to claim victory.",
    mechanics: {}
  },
  "Guardian Angel": {
    faction: "Neutral",
    subalignment: "Benign",
    name: "Guardian Angel",
    winCondition: "Keep your target alive until the end of the game.",
    defense: "None",
    attack: "None",
    dayAbility: "Protect your target from all harm today.",
    nightAbility: "Protect your target from all harm tonight.",
    hasFactionChat: false,
    canConvert: false,
    description: "You are assigned a target. You can shield them twice, curing and protecting them.",
    mechanics: { charges: 2, canSelfTarget: true }
  },
  Jester: {
    faction: "Neutral",
    subalignment: "Evil",
    name: "Jester",
    winCondition: "Get yourself executed on trial.",
    defense: "None",
    attack: "Unstoppable",
    hasFactionChat: false,
    canConvert: false,
    description: "Trick the Town into voting you guilty. If you die on trial, kill one guilty/abstaining voter at night.",
    mechanics: {}
  },
  Juggernaut: {
    faction: "Neutral",
    subalignment: "Killing",
    name: "Juggernaut",
    winCondition: "Eliminate everyone who opposes you.",
    defense: "Basic",
    attack: "Basic",
    nightAbility: "Attack a target, growing in strength with every kill.",
    hasFactionChat: false,
    canConvert: false,
    description: "A legendary Neutral force that becomes faster, stronger, and more resilient with each kill.",
    mechanics: {}
  },
  Pirate: {
    faction: "Neutral",
    subalignment: "Chaos",
    name: "Pirate",
    winCondition: "Successfully plunder two players in duels.",
    defense: "None",
    attack: "Powerful",
    nightAbility: "Plunder a target in a Rock-Paper-Scissors styled duel.",
    hasFactionChat: false,
    canConvert: false,
    description: "Choose a target, choose a weapon, and duel them. Win 2 duels to win the game.",
    mechanics: {}
  },
  Plaguebearer: {
    faction: "Neutral",
    subalignment: "Chaos",
    name: "Plaguebearer",
    winCondition: "Infect everyone to transform into Pestilence.",
    defense: "Basic",
    attack: "None",
    nightAbility: "Infect a player. Infection spreads via visits.",
    hasFactionChat: false,
    canConvert: true,
    description: "Infect targets. When all living players are infected, transform into Pestilence, Horseman of the Apocalypse.",
    mechanics: {}
  },
  "Serial Killer": {
    faction: "Neutral",
    subalignment: "Killing",
    name: "Serial Killer",
    winCondition: "Murder everyone in the town.",
    defense: "Basic",
    attack: "Basic",
    nightAbility: "Stab a target player. Retaliate against roleblockers.",
    hasFactionChat: false,
    canConvert: false,
    description: "Kill one player every night. If roleblocked, kill your roleblocker instead.",
    mechanics: { roleblockImmune: false }
  },
  Survivor: {
    faction: "Neutral",
    subalignment: "Benign",
    name: "Survivor",
    winCondition: "Live to see the end of the game.",
    defense: "None",
    attack: "None",
    nightAbility: "Put on a bulletproof vest to gain Basic defense.",
    hasFactionChat: false,
    canConvert: false,
    description: "You have no team. Simply survive the chaos by donning vests.",
    mechanics: { charges: 4, canSelfTarget: true }
  },
  Vampire: {
    faction: "Neutral",
    subalignment: "Chaos",
    name: "Vampire",
    winCondition: "Convert or eliminate all opposing factions.",
    defense: "None",
    attack: "Basic",
    nightAbility: "Bite a player to recruit them to the Vampire coven.",
    hasFactionChat: true,
    canConvert: true,
    description: "Bite targets. If they are non-immune, they transform into a Vampire. Shares faction chat.",
    mechanics: { cooldown: 1 }
  },
  Werewolf: {
    faction: "Neutral",
    subalignment: "Killing",
    name: "Werewolf",
    winCondition: "Ravage everyone in town.",
    defense: "Basic",
    attack: "Powerful",
    nightAbility: "Rampage at a target's house on Full Moon nights.",
    hasFactionChat: false,
    canConvert: false,
    description: "On even nights (Full Moon), transform into a Werewolf, gaining Powerful attack/defense and rampaging.",
    mechanics: {}
  },
  Doomsday: {
    faction: "Neutral",
    subalignment: "Chaos",
    name: "Doomsday",
    winCondition: "Correctly predict 3 player deaths to ascend.",
    defense: "Basic",
    attack: "None",
    dayAbility: "Predict a player's demise.",
    hasFactionChat: false,
    canConvert: false,
    description: "Predict which players will die. If your predictions succeed, you win and leave the town.",
    mechanics: {}
  },
  Shroud: {
    faction: "Neutral",
    subalignment: "Killing",
    name: "Shroud",
    winCondition: "Kill all players who oppose you.",
    defense: "Basic",
    attack: "Basic",
    nightAbility: "Shroud a player, making their visits attack their targets.",
    hasFactionChat: false,
    canConvert: false,
    description: "Force other players to perform your killings indirectly.",
    mechanics: {}
  }
} satisfies Record<string, RoleDef>;
