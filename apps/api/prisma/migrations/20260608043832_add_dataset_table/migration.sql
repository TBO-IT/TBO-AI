/*
  Warnings:

  - Made the column `full_name` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "users_clerk_user_id_idx";

-- DropIndex
DROP INDEX "users_email_idx";

-- DropIndex
DROP INDEX "users_is_active_idx";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL,
ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "datasets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "redis_key" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
