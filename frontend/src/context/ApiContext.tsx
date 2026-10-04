import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createLiveApi } from "../api/live";
import { createMockApi, type MockScenario } from "../api/mock";
import type { ApiClient } from "../api/types";

interface ApiContextValue {
  api: ApiClient;
  userId: number | null;
  setUserId: (id: number | null) => void;
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
  const [userId, setUser] = useState<number | null>(null);
  const [scenario, setScenarioState] = useState<MockScenario>("normal");
  const userRef = useRef(userId);
  const scenarioRef = useRef(scenario);
  const isMock = mockMode ?? import.meta.env.VITE_USE_MOCKS !== "false";
  const [api] = useState(
    () =>
      client ??
      (isMock
        ? createMockApi({
            getDemoUserId: () => userRef.current,
            getScenario: () => scenarioRef.current,
          })
        : createLiveApi(
            import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
            () => userRef.current,
          )),
  );
  const setUserId = (id: number | null) => {
    userRef.current = id;
    setUser(id);
  };
  const setScenario = (value: MockScenario) => {
    scenarioRef.current = value;
    setScenarioState(value);
  };
  return (
    <ApiContext.Provider
      value={{ api, userId, setUserId, isMock, scenario, setScenario }}
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
