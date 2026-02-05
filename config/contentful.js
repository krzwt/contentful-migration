import contentful from "contentful-management";
import dotenv from "dotenv";

dotenv.config();

export async function getEnvironment() {
  if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
    throw new Error("Missing CONTENTFUL_MANAGEMENT_TOKEN in .env");
  }

  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
  });

  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);

  return await space.getEnvironment(
    process.env.CONTENTFUL_ENV || "master"
  );
}
