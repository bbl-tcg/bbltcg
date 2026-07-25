// BBLTCG-001 reprints ~40 cards as Alternative Art / Secret Rare variants of an earlier
// printing with the same name/trigger/effect text. Import this file LAST (after every
// primary card id above has registered) so aliasEffect() can find what it's pointing to.
import { aliasEffect } from "../engine/effectRegistry.js";

const ALIASES = [
  ["001-117", "001-006"], // Skuba Doo
  ["001-118", "001-007"], // Coach Schmaxel
  ["001-155", "001-007"],
  ["001-119", "001-008"], // Coach Jan 15
  ["001-120", "001-014"], // Silvia Snipes
  ["001-121", "001-015"], // Coach Le Finn
  ["001-122", "001-016"], // Coach Rocky
  ["001-123", "001-022"], // Joao
  ["001-124", "001-023"], // Coach Rares
  ["001-125", "001-024"], // Coach LeMarch
  ["001-126", "001-030"], // Simon Chapman
  ["001-127", "001-031"], // Coach Blossom
  ["001-128", "001-032"], // Coach April 49
  ["001-129", "001-038"], // Ricky Covey, Jr.
  ["001-130", "001-039"], // Coach BetaBros
  ["001-131", "001-040"], // Coach May Fanpage
  ["001-132", "001-046"], // Miguel Borja, Jr.
  ["001-133", "001-047"], // Coach Mourinho
  ["001-134", "001-048"], // Coach June Fanpage
  ["001-135", "001-054"], // JanJan
  ["001-153", "001-054"],
  ["001-136", "001-055"], // Coach Romano
  ["101-136", "001-055"], // Coach Romano - tournament-exclusive alt art (TOURNAMENT101 code)
  ["001-137", "001-056"], // Coach Tall
  ["001-138", "001-062"], // Ballex Pereira
  ["001-139", "001-063"], // Coach Ale
  ["001-140", "001-064"], // Coach Cap
  ["001-141", "001-070"], // Ragnar
  ["001-142", "001-071"], // Coach JC
  ["001-143", "001-072"], // Coach Times
  ["001-144", "001-078"], // Justin Wells
  ["001-154", "001-078"],
  ["001-145", "001-079"], // Coach Belichick
  ["001-156", "001-079"],
  ["001-146", "001-080"], // Coach Stark
  ["001-147", "001-086"], // Hal Lewis
  ["001-148", "001-087"], // Coach Buffalo
  ["001-149", "001-088"], // Coach Alex
  ["001-150", "001-094"], // Leo Haze
  ["001-151", "001-095"], // Coach Snowball
  ["001-152", "001-096"], // Coach Harry
];

for (const [newId, existingId] of ALIASES) {
  aliasEffect(newId, existingId);
}
