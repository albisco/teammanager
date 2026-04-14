import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Source: U10_LionsRoster.csv
// Columns: Number, DOB, Name, Surname, Parent 1, P1 PH, P1 Email, Parent 2, P2 Ph, P2 Email
const players = [
  { jumperNumber: 1,  firstName: "Harrison", surname: "Bailey",      dob: "2016-04-04", phone: "0407217037", email: "lannsie@hotmail.com",               parent1: "Alanna Bailey",      parent2: "Wes Bailey" },
  { jumperNumber: 2,  firstName: "Harry",    surname: "Chalmers",    dob: "2016-10-24", phone: "0413795634", email: "kellysinclair3@gmail.com",           parent1: "Kelly Sinclair",     parent2: "David Chalmers" },
  { jumperNumber: 4,  firstName: "Damon",    surname: "Czorny",      dob: null,         phone: "0402511691", email: "bczorny@gmail.com",                  parent1: "Brenton Czorny",     parent2: "Anette Szczepny" },
  { jumperNumber: 5,  firstName: "Julian",   surname: "Dumanski",    dob: "2016-05-24", phone: "0414481812", email: "alisonprigg@hotmail.com",            parent1: "Alison Dumanski",    parent2: "Paul Dumanski" },
  { jumperNumber: 7,  firstName: "Alexander",surname: "Tirant",      dob: "2016-01-15", phone: "0413371981", email: "atirant@lululemon.com",              parent1: "Anthony Tirant",     parent2: null },
  { jumperNumber: 8,  firstName: "Freddie",  surname: "Fifield",     dob: "2016-11-20", phone: "0413348122", email: "gregf_2006@hotmail.com",             parent1: "Greg Fifield",       parent2: "Monique Gent" },
  { jumperNumber: 9,  firstName: "Noah",     surname: "Sheard",      dob: "2016-04-02", phone: "0402301820", email: "ireneasheard@gmail.com",             parent1: "Irene Sheard",       parent2: "Gregory Sheard" },
  { jumperNumber: 10, firstName: "Matty",    surname: "Hester",      dob: "2016-07-21", phone: "0438084103", email: "malcolm@elevatefg.com.au",           parent1: "Malcolm Hester",     parent2: "Leora Hester" },
  { jumperNumber: 11, firstName: "Vladimir", surname: "Petrakis",    dob: null,         phone: "0420586867", email: "irinamozgova@yahoo.com.au",          parent1: "Iryna MOZGOVA",      parent2: "Michelle Brown" },
  { jumperNumber: 12, firstName: "Zac",      surname: "Gounis",      dob: "2016-06-11", phone: "0418386972", email: "goonie@iinet.net.au",                parent1: "Maria Gounis",       parent2: "Chrisoula Gounis" },
  { jumperNumber: 14, firstName: "John",     surname: "Koob",        dob: "2016-06-27", phone: "0418562830", email: "ckoob@hotmail.com",                  parent1: "Christina Koob",     parent2: "Justin Koob" },
  { jumperNumber: 15, firstName: "James",    surname: "Marks",       dob: "2016-02-27", phone: "0439931207", email: "tim@darkhill.com.au",                parent1: "Tim Marks",          parent2: "Heather Marks" },
  { jumperNumber: 16, firstName: "Matias",   surname: "Garcia",      dob: "2016-12-30", phone: "0410773432", email: "camilag_0115@hotmail.com",           parent1: "Laura Guerrero",     parent2: "Andres Garcia" },
  { jumperNumber: 18, firstName: "Lawson",   surname: "McGregor",    dob: "2017-02-14", phone: "0409799862", email: "lyndenmcgregor@gmail.com",           parent1: "Lynden McGregor",    parent2: "Kylie McGregor" },
  { jumperNumber: 19, firstName: "Sonny",    surname: "Firth",       dob: "2016-07-24", phone: "0439804068", email: "peterfirth81@yahoo.com.au",          parent1: "Peter Firth",        parent2: "Suzie Firth" },
  { jumperNumber: 20, firstName: "Leo",      surname: "Myers",       dob: "2017-02-15", phone: "0433682235", email: "wzk51@hotmail.com",                  parent1: "Jin Wang",           parent2: "Paul Myers" },
  { jumperNumber: 21, firstName: "Tommy",    surname: "Prendergast", dob: "2016-12-16", phone: "0417126693", email: "eprendergast@riversidecompany.com",  parent1: "Elizabeth Prendergast", parent2: "Gav" },
  { jumperNumber: 23, firstName: "James",    surname: "Taylor",      dob: "2016-07-01", phone: "0412061884", email: "mark2016taylor@gmail.com",           parent1: "Mark Taylor",        parent2: "Wendy Taylor" },
  { jumperNumber: 30, firstName: "William",  surname: "Freame",      dob: "2016-05-25", phone: "0412655528", email: "echackola@hotmail.com",              parent1: "Elizabeth Chackola", parent2: "Tim Freame" },
  { jumperNumber: 31, firstName: "William",  surname: "Savio",       dob: "2016-11-10", phone: "0433046154", email: "lauraclark37@hotmail.com",           parent1: "Laura Savio",        parent2: "Adrian Savio" },
];

async function main() {
  const club = await prisma.club.findUnique({ where: { slug: "murrumbeena-jfc" } });
  if (!club) throw new Error("Club 'murrumbeena-jfc' not found — run seed-murrumbeena first");

  const team = await prisma.team.findFirst({
    where: { name: "Lions", ageGroup: "U10", season: { clubId: club.id } },
    orderBy: { season: { year: "desc" } },
    include: { season: true },
  });
  if (!team) throw new Error("U10 Lions team not found — run seed-murrumbeena first");
  console.log(`Importing into: ${team.ageGroup} ${team.name} (${team.season.name})\n`);

  let created = 0;
  let updated = 0;

  for (const p of players) {
    const existing = await prisma.player.findFirst({
      where: { clubId: club.id, firstName: p.firstName, surname: p.surname },
    });

    let player;
    if (existing) {
      player = await prisma.player.update({
        where: { id: existing.id },
        data: {
          jumperNumber: p.jumperNumber,
          dateOfBirth:  p.dob ? new Date(p.dob) : null,
          phone:        p.phone,
          contactEmail: p.email,
          parent1:      p.parent1,
          parent2:      p.parent2 ?? null,
        },
      });
      console.log(`  Updated  #${String(p.jumperNumber).padStart(2)} ${p.firstName} ${p.surname}`);
      updated++;
    } else {
      player = await prisma.player.create({
        data: {
          jumperNumber: p.jumperNumber,
          firstName:    p.firstName,
          surname:      p.surname,
          dateOfBirth:  p.dob ? new Date(p.dob) : null,
          phone:        p.phone,
          contactEmail: p.email,
          parent1:      p.parent1,
          parent2:      p.parent2 ?? null,
          clubId:       club.id,
        },
      });
      console.log(`  Created  #${String(p.jumperNumber).padStart(2)} ${p.firstName} ${p.surname}`);
      created++;
    }

    await prisma.teamPlayer.upsert({
      where: { teamId_playerId: { teamId: team.id, playerId: player.id } },
      update: {},
      create: { teamId: team.id, playerId: player.id },
    });
  }

  console.log(`\nDone — ${created} created, ${updated} updated, ${created + updated} assigned to ${team.ageGroup} ${team.name}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
