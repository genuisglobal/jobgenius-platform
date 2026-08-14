import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { watDate } from "@/lib/attendance";
import AttendanceBoardClient from "./AttendanceBoardClient";

type PageProps = {
  searchParams?: { date?: string };
};

export default async function AttendancePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const requested = searchParams?.date;
  const initialDate =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : watDate();

  return <AttendanceBoardClient initialDate={initialDate} />;
}
