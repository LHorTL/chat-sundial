import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { isCountdownDue, type CountdownTask, type SendMessageTarget } from "../lib/onebot";
import { buildCountdownRegistration } from "../lib/qqViewModel";

interface UseCountdownTasksOptions {
  sendTarget(target: SendMessageTarget): Promise<unknown>;
}

/** 管理倒计时任务队列和到点发送调度，发送成功后自动移除任务。 */
export function useCountdownTasks({ sendTarget }: UseCountdownTasksOptions) {
  const [tasks, setTasks] = useState<CountdownTask[]>([]);
  const tasksRef = useRef(tasks);
  const sendingTaskIdsRef = useRef(new Set<string>());
  const registrations = useMemo<GlobalTaskRegistration[]>(() => tasks.map(buildCountdownRegistration), [tasks]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const dueTasks = tasksRef.current.filter(
        (task) => task.status === "waiting" && isCountdownDue(task, Date.now()) && !sendingTaskIdsRef.current.has(task.id)
      );

      dueTasks.forEach((task) => {
        sendingTaskIdsRef.current.add(task.id);
        sendTarget(task)
          .then(() => {
            setTasks((current) => current.filter((item) => item.id !== task.id));
          })
          .catch((error) => {
            setTasks((current) =>
              current.map((item) =>
                item.id === task.id
                  ? { ...item, status: "failed", lastError: error instanceof Error ? error.message : String(error) }
                  : item
              )
            );
          })
          .finally(() => {
            sendingTaskIdsRef.current.delete(task.id);
          });
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sendTarget]);

  /** 新增一个等待发送的倒计时任务。 */
  const createTask = useCallback((task: CountdownTask) => {
    setTasks((current) => [task, ...current]);
  }, []);

  /** 从队列里删除指定倒计时任务。 */
  const removeTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  return {
    tasks,
    registrations,
    createTask,
    removeTask
  };
}
