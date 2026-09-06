# Tony Hawk's Pro Skater 1+2 Scoring System

This document outlines the point values and scoring mechanics for Tony Hawk's Pro Skater 1+2, based on the original games and the remastered version.

## Core Scoring Mechanics

### Combo System
- Tricks must be **chained together** to form combos
- Each trick in a combo increases the **multiplier** by 1x
- The combo ends when you land without maintaining momentum (no manual/grind/lip trick)
- **Formula**: `(Sum of all trick base scores) × Multiplier`

### Multiplier Progression
```
First trick:  1x multiplier
Second trick: 2x multiplier
Third trick:  3x multiplier
Fourth trick: 4x multiplier
... and so on
```

### Multiplier Bonuses
The following actions add to your multiplier:

1. **Each trick performed** - Adds 1x to the multiplier
2. **Gaps** - Environmental obstacles (rails, stairs, etc.) add 1x when cleared mid-combo
3. **Spins** - Rotating during tricks (180°, 360°, 540°, 720°) adds to the multiplier
4. **Switch Stance** - Riding switch (opposite of your natural stance) applies a **1.2x bonus** to tricks

### Trick Degradation
Repeating the same trick in a combo causes its score to degrade:

```
1st use:  100% (full points)
2nd use:   75% of base value
3rd use:   50% of base value
4th use:   25% of base value
5th+ use:  10% of base value
```

**Important:** Performing a trick in switch stance counts as a different trick and resets the degradation.

---

## Trick Point Values

### Basic Tricks

#### Ollies & Variants
| Trick | Base Points |
|-------|-------------|
| Ollie | 100 |
| Nollie | 200 |
| Boneless | 250 |

#### Flip Tricks
| Trick | Base Points |
|-------|-------------|
| Kickflip | 100 |
| Heelflip | 100 |
| Pop Shove-It | 100 |
| 360 Flip | 100 |
| Varial Kickflip | 100 |
| Varial Heelflip | 100 |
| Hardflip | 100 |
| Inward Heelflip | 100 |

*Note: Flip tricks typically have the same base value. Multiple rotations and variations increase the score.*

### Manual Tricks
| Trick | Base Points |
|-------|-------------|
| Manual | 100 |
| Nose Manual | 100 |
| One Foot Manual | 100 |
| Casper | 100 |
| Pogo | 100 |

*Manuals are crucial for maintaining combos between tricks but have low base scores.*

### Grind Tricks

#### Basic Grinds (100 points)
| Trick | Base Points |
|-------|-------------|
| 50-50 (BS/FS) | 100 |
| 5-0 (BS/FS) | 100 |
| Nosegrind (BS/FS) | 100 |

#### Advanced Grinds (125 points)
| Trick | Base Points |
|-------|-------------|
| Crooked (BS/FS) | 125 |
| Feeble (BS/FS) | 125 |
| Smith (BS/FS) | 125 |
| Overcrook (BS/FS) | 125 |

#### Slide Tricks
| Trick | Base Points |
|-------|-------------|
| Noseslide (BS/FS) | 150 |
| Tailslide (BS/FS) | 150 |
| Boardslide (BS/FS) | 200 |
| Lipslide (BS/FS) | 200 |
| Bluntslide (BS/FS) | 200 |

*BS = Backside, FS = Frontside*

### Grab Tricks

#### Weak Grabs
| Trick | Base Points |
|-------|-------------|
| Airwalk | 50 |
| *Other weak grabs* | 50 |

#### Standard Grabs (300 points)
| Trick | Base Points |
|-------|-------------|
| Indy | 300 |
| Melon | 300 |
| Method | 300 |
| Nosegrab | 300 |
| Tailgrab | 300 |
| Stalefish | 300 |
| Benihana | 300 |

#### Advanced Grabs (350 points)
| Trick | Base Points |
|-------|-------------|
| Mute | 350 |
| Japan | 350 |
| Crail Grab | 350 |
| Crossbone | 350 |
| Judo | 350 |
| Rocket Air | 350 |

#### Double-Tap Variations (500 points)
| Trick | Base Points |
|-------|-------------|
| Stiffy (Double Indy) | 500 |
| One Foot Tailgrab | 500 |
| *Other double-tap grabs* | 500 |

### Special Tricks
| Trick Type | Base Points |
|------------|-------------|
| Special Tricks | 6,000 - 10,000 |

Special tricks vary by character and require a full special meter. Examples include:
- **The 900** (Tony Hawk)
- **Christ Air** (Christian Hosoi)
- **Kickflip McTwist**
- **Madonna**
- Character-specific signature moves

---

## Scoring Strategies

### Building Million-Point Combos

1. **Start with a Special Trick** (6,000-10,000 base points)
   - Add spins (360°, 540°, 720°) to increase the base even more

2. **Link with Manuals** (100 points each)
   - Manuals keep the combo alive on flat ground
   - Alternate between regular and nose manuals for variety

3. **Chain Multiple Trick Types**
   - Mix flips, grabs, grinds, and manuals
   - Avoid repeating the same trick to prevent degradation

4. **Hit Gaps**
   - Each gap adds to your multiplier
   - Plan routes through parks that chain multiple gaps

5. **Use Switch Stance**
   - Revert after vert tricks to change stance
   - Treats repeated tricks as new for scoring purposes
   - Adds 1.2x bonus to trick values

6. **Maximize Multiplier**
   - The longer the combo, the higher the multiplier
   - A 20-trick combo has a 20x multiplier
   - Even low-value tricks (100 points) become significant at high multipliers

### Example High-Score Combo

```
The 900 (540° spin)           10,000 pts  ×1  = 10,000
Manual                           100 pts  ×2  =    200
Kickflip                         100 pts  ×3  =    300
Manual                           100 pts  ×4  =    400
Grind (Gap bonus)                100 pts  ×5+1 =  600
Boardslide                       200 pts  ×7  = 1,400
Manual                           100 pts  ×8  =    800
Heelflip                         100 pts  ×9  =    900
Revert (Switch stance)             0 pts  ×10 =     0
Manual                           100 pts  ×11 = 1,100
Indy Grab                        300 pts  ×12 = 3,600
... continue chaining ...

Total: Base score × Final multiplier = Massive combo!
```

### Key Principles

- **Variety is crucial** - Degradation heavily punishes repetition
- **Manuals are essential** - They bridge tricks with minimal points but maintain the combo
- **Special tricks provide base score** - Use them early in combos
- **Multiplier is king** - A 30x multiplier makes even a 100-point trick worth 3,000
- **Practice routing** - Learn park layouts to chain gaps and grind lines
- **Master reverts** - Essential for vert-to-flatland combo transitions

---

## Technical Details

### Point Calculation Formula

```
Final Score = Σ(Trick Base Value × Stance Multiplier × Degradation Factor) × Combo Multiplier
```

Where:
- **Trick Base Value** = Points from the table above
- **Stance Multiplier** = 1.2 if switch, 1.0 if regular
- **Degradation Factor** = 1.0, 0.75, 0.5, 0.25, or 0.1 based on repetition
- **Combo Multiplier** = Number of tricks/gaps in the combo

### Spin Bonuses

Spinning during tricks adds to both:
1. **Base score** - More rotation = higher base value
2. **Multiplier** - Each spin increment can add to the multiplier

Common spin values:
- 180° = Small bonus
- 360° = Medium bonus
- 540° = Large bonus
- 720° = Very large bonus
- 900° = Maximum bonus (The 900 special trick)

### Lip Tricks

Lip tricks (performed on the edge of ramps) have similar scoring to grinds:
- **Rock to Fakie**: ~100 points
- **Axle Stall**: ~100 points
- **Nosestall**: ~100 points
- **Blunt**: ~150 points
- **Disaster**: ~150 points

---

## Notes

- Point values are based on Tony Hawk's Pro Skater 1, 2, and 3 data, which form the foundation for THPS 1+2
- The remaster maintains the core scoring mechanics of the original games
- Some tricks may have slight variations in exact values between games
- Special tricks and their point values are character-specific
- Environmental factors (vert height, grind length) can affect final trick values
- The special meter must be full to perform special tricks (fill by landing tricks)

---

*This document was compiled from official Activision support documentation, community guides, and game data from the Tony Hawk's Pro Skater series.*
