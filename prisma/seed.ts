import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@teammanager.com" },
    update: {},
    create: {
      email: "admin@teammanager.com",
      passwordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });

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
