import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create default club
  const club = await prisma.club.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Club",
      slug: "default",
    },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@teammanager.com" },
    update: {},
    create: {
      email: "admin@teammanager.com",
      passwordHash,
      name: "Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log("Seeded club:", club.name, `(${club.slug})`);
  console.log("Seeded admin user:", admin.email);
  console.log("Password: admin123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
