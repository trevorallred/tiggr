import { runTests } from './main'
import { TestRunner } from './main.test.util'
import { type TestDefinition } from './types'

type SampleState = {
  a?: string
}

describe('testing framework', () => {
  const runner = new TestRunner()
  const initial: SampleState = {}
  function stubTest(id: string, partial?: Partial<TestDefinition<SampleState>>): TestDefinition<SampleState> {
    return {
      id,
      evaluate: async () => {
        await runner.run(id)
        return true
      },
      ...partial,
    }
  }

  it('should run tests', async () => {
    runner.clear()
    await runTests<SampleState>(
      [
        {
          id: 'd',
          dependsOn: ['c'],
          evaluate: async (state) => {
            await runner.run('d->a=' + state.a)
            return true
          },
        },
        {
          id: 'c',
          tearsDown: 'a',
          evaluate: async (state) => {
            await runner.run('c->a=' + state.a)
            delete state.a
            return true
          },
        },
        {
          id: 'b',
          dependsOn: ['a'],
          evaluate: async (state) => {
            await runner.run('b->a=' + state.a)
            return true
          },
        },
        {
          id: 'a',
          evaluate: async (state) => {
            await runner.run('a')
            state.a = '1'
            return true
          },
        },
      ],
      { initial }
    )
    expect(runner.toString()).toEqual('a,b->a=1,c->a=1,d->a=undefined')
  })

  it('should teardown multiple levels deep', async () => {
    runner.clear()
    await runTests<SampleState>(
      [
        {
          id: 'create2',
          dependsOn: ['create1'],
          evaluate: async (state) => {
            await runner.run('c2')
            return true
          },
        },
        {
          id: 'create1',
          evaluate: async (state) => {
            await runner.run('c1')
            return true
          },
        },
        {
          id: 'remove1',
          tearsDown: 'create1',
          evaluate: async (state) => {
            await runner.run('r1')
            return true
          },
        },
        {
          id: 'remove2',
          tearsDown: 'create2',
          evaluate: async (state) => {
            await runner.run('r2')
            return true
          },
        },
      ],
      { initial }
    )
    expect(runner.toString()).toEqual('c1,c2,r2,r1')
  })

  it('should skip tests', async () => {
    runner.clear()
    await runTests([stubTest('a', { skip: true }), stubTest('b')], { initial })
    expect(runner.toString()).toEqual('b')
  })
  it('should run the "only" tests', async () => {
    runner.clear()
    await runTests([stubTest('a'), stubTest('b', { only: true }), stubTest('c', { only: true })], { initial })
    expect(runner.toString()).toEqual('b,c')
  })
  it('should catch errors on single tests', async () => {
    runner.clear()
    const output = await runTests(
      [
        stubTest('a', {
          evaluate: () => {
            throw new Error('test error')
          },
        }),
        stubTest('b'),
      ],
      { initial }
    )
    expect(runner.toString()).toEqual('b')
    expect(output.tests.find((test) => test.id === 'a')?.output).toBe('test error')
  })
  it('should skip all tests on dryRun', async () => {
    runner.clear()
    await runTests([stubTest('a')], { initial, dryRun: true })
    expect(runner.toString()).toEqual('')
  })
  it('should skip tests with exclude tags', async () => {
    runner.clear()
    await runTests([stubTest('a', { tags: ['no'] }), stubTest('b', { tags: ['yes'] }), stubTest('no')], {
      initial,
      exclude: ['no'],
    })
    expect(runner.toString()).toEqual('b')
  })
  it('should include tests with include tags', async () => {
    runner.clear()
    await runTests([stubTest('a', { tags: ['no'] }), stubTest('b', { tags: ['yes'] }), stubTest('yes')], {
      initial,
      include: ['yes'],
    })
    expect(runner.toString()).toEqual('b,yes')
  })
  it('should change the state', async () => {
    const result = await runTests(
      [
        stubTest('a', {
          evaluate: async (state) => {
            state.a = '1'
            return true
          },
        }),
      ],
      { initial }
    )
    expect(result.state).toEqual({ a: '1' })
  })

  it('should stop running if circular dependency', () => {
    return expect(
      runTests([stubTest('a', { dependsOn: ['b'] }), stubTest('b', { dependsOn: ['a'] })], { initial })
    ).rejects.toThrow('No tests ran this loop, possible circular dependency')
  })

  it('should wait to teardown "a" until "a" completes', async () => {
    runner.clear()
    await runTests([stubTest('b', { tearsDown: 'a' }), stubTest('a')], { initial })
    expect(runner.toString()).toEqual('a,b')
  })

  it('should stop running tests after failure', async () => {
    runner.clear()
    await runTests(
      [
        stubTest('a', { evaluate: () => Promise.reject('fail') }),
        stubTest('b', {
          evaluate: async () => {
            runner.run('b')
            return true
          },
          dependsOn: ['a'],
        }),
        stubTest('c', {
          evaluate: async () => {
            runner.run('c')
            return true
          },
          dependsOn: ['b'],
        }),
      ],
      { initial }
    )
    expect(runner.toString()).toEqual('')
  })
})
