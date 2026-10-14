import {
  listDisciplinaryRecords,
  listPeopleEmployees,
} from "@/lib/people-server";
import DisciplineClient from "./DisciplineClient";

export const dynamic = "force-dynamic";

export default async function PeopleDisciplinePage() {
  const [employees, records] = await Promise.all([
    listPeopleEmployees(),
    listDisciplinaryRecords(),
  ]);

  return <DisciplineClient initialEmployees={employees} initialRecords={records} />;
}
