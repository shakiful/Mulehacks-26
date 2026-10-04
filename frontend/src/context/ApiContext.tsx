import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createLiveApi } from "../api/live";
import { createMockApi, type MockScenario } from "../api/mock";
import type { ApiClient, StudentUser } from "../api/types";

interface ApiContextValue {
  api: ApiClient;
  userId: number | null;
  user: StudentUser | null;
  authLoading: boolean;
  authError: unknown;
  reloadSession: () => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isMock: boolean;
  scenario: MockScenario;
  setScenario: (scenario: MockScenario) => void;
}
const ApiContext = createContext<ApiContextValue | null>(null);
export function ApiProvider({
  children,
  client,
  mockMode,
}: {
  children: ReactNode;
  client?: ApiClient;
  mockMode?: boolean;
}) {
  const [user, setUser] = useState<StudentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [scenario, setScenarioState] = useState<MockScenario>("normal");
  const scenarioRef = useRef(scenario);
  const isMock = mockMode ?? import.meta.env.VITE_USE_MOCKS === "true";
  const [api] = useState(
    () =>
      client ??
      (isMock
        ? createMockApi({
            getScenario: () => scenarioRef.current,
          })
        : createLiveApi(
            import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
            fetch,
            () => setUser(null),
          )),
  );
  useEffect(() => {
    let active = true;
    setAuthLoading(true);
    setAuthError(null);
    api.getSession().then((session) => {
      if (active) setUser(session.user);
    }).catch((error: unknown) => {
      if (active) setAuthError(error);
    }).finally(() => {
      if (active) setAuthLoading(false);
    });
    return () => { active = false; };
  }, [api, revision]);
  const signIn = async (username: string, password: string) => {
    const session = await api.login(username, password);
    setUser(session.user);
  };
  const signOut = async () => {
    await api.logout();
    setUser(null);
    setScenarioState("normal");
    scenarioRef.current = "normal";
  };
  const setScenario = (value: MockScenario) => {
    scenarioRef.current = value;
    setScenarioState(value);
  };
  return (
    <ApiContext.Provider
      value={{ api, userId: user?.id ?? null, user, authLoading, authError,
        reloadSession: () => setRevision((value) => value + 1), signIn, signOut,
        isMock, scenario, setScenario }}
    >
      {children}
    </ApiContext.Provider>
  );
}
export function useApi() {
  const context = useContext(ApiContext);
  if (!context) throw new Error("useApi requires ApiProvider");
  return context;
}
