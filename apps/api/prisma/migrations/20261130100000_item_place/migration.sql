-- Place reminders: the words for the place only ("the supermarket"); coordinates stay on the phone.
ALTER TABLE "items" ADD COLUMN "place" TEXT,
ADD COLUMN "place_on" TEXT;
