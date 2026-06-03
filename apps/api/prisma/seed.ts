import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    await prisma.userRole.createMany({
        data: [
            {
                roleName: "viewer",
                canUpload: false,
                canQuery: true,
                canExport: false,
                canManageUsers: false,
                canViewAdminDashboard: false,
            },
            {
                roleName: "analyst",
                canUpload: true,
                canQuery: true,
                canExport: true,
                canManageUsers: false,
                canViewAdminDashboard: false,
            },
            {
                roleName: "admin",
                canUpload: true,
                canQuery: true,
                canExport: true,
                canManageUsers: true,
                canViewAdminDashboard: true,
            },
        ],
    });

    console.log("Roles seeded");
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });