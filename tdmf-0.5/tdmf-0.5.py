# A Test Driven Modular Application Framework - by Monty Dimkpa
#
# building blocks: unit_tests, package_tests, test modules, test_driven atomic functions, pipelines,
# workflows, context switches and flags (global mutable state) based routing
#
# Version: 0.5

import datetime

global flags, testEngine

class MutableState:
    '''
        Mutable state for message-passing between functions, pipelines
        and workflows.
    '''
    def __init__(self):
        self.state = {}

    def get(self, key):
        if key in self.state:
            return self.state[key]
        else:
            return None

    def set(self, key, value):
        if key:
            self.state[key] = value
        return key, value

flags = MutableState()

class fetch_flag_inline:
	def __init__(self, item):
		self.item = item
		self.output = flags.get(self.item)

def now():
    # get the current time
    return datetime.datetime.today()

def elapsed_secs(t):
    # get the total seconds elapsed since time t
    return (now() - t).total_seconds()

def pt_string_only(package):
    # package test: check only string items in package
    return sum([isinstance(item, str) for item in package]) == len(package)

def pt_int_only(package):
    # package test: check only integer items in package
    return sum([isinstance(item, int) for item in package]) == len(package)

def pt_real_only(package):
    # package test: check only real items in package
    return sum([bool(isinstance(item, int) or isinstance(item, float)) for item in package]) == len(package)

def pt_dict_only(package):
    # package test: check only dict items in package
    return sum([isinstance(item, dict) for item in package]) == len(package)

class TestRegister:
    '''
        Allows you to register and de-register tests for functions
    '''
    def __init__(self):
        self.register = {}
        self.last_register_status = -1

    def add_test(self, test_category, function, test_name, test_package=None, test_output=None):
        if test_category in ["package", "unit"]:
            obj = test_name
            if test_package:
                obj = (test_name, test_package, test_output)
            if function in self.register:
                if test_category in self.register[function]:
                    if test_name not in self.register[function][test_category]:
                        self.register[function][test_category].append(obj)
                else:
                    self.register[function][test_category] = [obj]
            else:
                self.register[function] = {}
                self.register[function][test_category] = [obj]
            self.last_register_status = 1
        else:
            self.last_register_status = 0

    def remove_test(self, test_category, function, test_name):
        self.last_register_status = 0
        if function in self.register:
            if test_category in self.register[function]:
                found = [self.register[function][test_category].index(x) for x in self.register[function][test_category] if test_name in x]
                if found:
                    index = found[0]
                    self.register[function][test_category].pop(index)
                    self.last_register_status = 1

    def lookup_tests(self, function):
        if function in self.register:
            return self.register[function]
        else:
            return { "package" : [], "unit" : [] }

class TestModule(TestRegister):
    '''
        Allows you to run registered function tests inside your pipelines
    '''
    def __init__(self):
        super().__init__()
        self.test_status = {}
        self.last_test_output = None

    def report(self, function):
        template = '''
        function: {}

        ---- PACKAGE TESTS ----

        PASSED: {} tests
        FAILED: {} tests: {}
        NOT_FOUND: {} tests: {}
        duration: {} secs.

        ---- UNIT TESTS ----

        PASSED: {} tests
        FAILED: {} tests: {}
        NOT_FOUND: {} tests: {}
        duration: {} secs.

        '''
        print(template.format(
                function, len(self.test_status[function]["package"]["passed"]), \
                len(self.test_status[function]["package"]["failed"]), self.test_status[function]["package"]["failed"],\
                len(self.test_status[function]["package"]["not_found"]), self.test_status[function]["package"]["not_found"],\
                self.test_status[function]["package"]["runtime"],\
                len(self.test_status[function]["unit"]["passed"]), \
                len(self.test_status[function]["unit"]["failed"]), self.test_status[function]["unit"]["failed"],\
                len(self.test_status[function]["unit"]["not_found"]), self.test_status[function]["unit"]["not_found"],\
                self.test_status[function]["unit"]["runtime"]
            )
        )

    def run_tests(self, function, package):
        self.test_status[function] = {
            "package" : {
                "passed" : [],
                "failed" : [],
                "not_found" : [],
                "runtime" : 0
            },
            "unit" : {
                "passed" : [],
                "failed" : [],
                "not_found" : [],
                "runtime" : 0
            },
            "approved" : False
        }
        tests = self.lookup_tests(function)
        try:
            package_tests = tests["package"]
        except:
            package_tests = []
        try:
            unit_tests = tests["unit"]
        except:
            unit_tests = []

        # run package tests
        started = now()
        for test in package_tests:
            test = "pt_{}".format(test)
            try:
                passed = eval(test)(package)
                if passed:
                    self.test_status[function]["package"]["passed"].append(test)
                else:
                    self.test_status[function]["package"]["failed"].append(test)
            except:
                self.test_status[function]["package"]["not_found"].append(test)
        self.test_status[function]["package"]["runtime"] = elapsed_secs(started)

        # run unit tests
        started = now()
        for test, test_package, test_output in unit_tests:
            try:
                if test_output == eval(function)(test_package):
                    self.test_status[function]["unit"]["passed"].append(test)
                    self.last_test_output = test_output
                else:
                    self.test_status[function]["unit"]["failed"].append(test)
            except:
                self.test_status[function]["unit"]["failed"].append(test)
        self.test_status[function]["unit"]["runtime"] = elapsed_secs(started)

        # check test approval and report
        total = self.test_status[function]["unit"]["passed"] + self.test_status[function]["package"]["passed"] + \
        self.test_status[function]["unit"]["not_found"] + self.test_status[function]["package"]["not_found"]
        if len(total) == len(package_tests + unit_tests):
            self.test_status[function]["approved"] = True
        self.report(function)

testEngine = TestModule()

class Pipeline:
    global testEngine
    '''
        Group related functions sequentially by piping the output of a preceding function
        to the input of the current function
    '''
    def __init__(self, process):
        self.process = process
        self.executed = False
        self.started = None
        self.output = None
        self.can_run = False
    def build(self):
        self.started = now()
        try:
            primer, curr_package = self.process[0]
            try:
                curr_package = eval(curr_package).output
            except:
                pass
            functions = [primer] + self.process[1:]
            failed = False
            for function in functions:
                testEngine.run_tests(function, curr_package)
                if testEngine.test_status[function]["approved"]:
                    curr_package = testEngine.last_test_output
                else:
                    failed = True
                    print("BuildError: pipeline build failed at function: {}. Duration: {} secs.".format(function, elapsed_secs(self.started)))
                    break
            if not failed:
                self.can_run = True
                self.run()
        except:
            print("BuildError: pipeline not properly constructed. Duration: {} secs.".format(elapsed_secs(self.started)))
    def run(self):
        self.started = now()
        if self.can_run:
            curr_package = None
            function = None
            no_errors = True
            index = 0
            for step in self.process:
                index += 1
                if index == 1:
                    function, curr_package = step
                    try:
                        curr_package = eval(curr_package).output
                    except:
                        pass
                else:
                    function = step
                curr_package = eval(function)(curr_package)
                if not curr_package:
                    no_errors = False
                    break
            if no_errors:
                self.output = curr_package
                self.executed = True
                self.can_run = False
                print("Pipeline executed successfully (check trace for function-specific errors). Duration: {} secs.".format(elapsed_secs(self.started)))
            else:
                print("Pipeline failed at step {} of {} [function: {}]. Duration: {} secs.".format(index, len(self.process), function, elapsed_secs(self.started)))
        else:
            print("RuntimeError: please build this pipeline first. Duration: {} secs.".format(elapsed_secs(self.started)))


class Workflow:
    '''
        Sequential pipeline execution model. Also supports workflow piping.
    '''
    def __init__(self, pipelines):
        self.pipelines = pipelines
        self.output = None
        self.executed = False
        self.started = None
    def build(self):
        self.run()
    def run(self):
        if self.pipelines:
            self.started = now()
            n_executed = 0
            no_errors = True
            curr_pipeline = None
            index = -1
            while n_executed < len(self.pipelines) and no_errors:
                index += 1
                curr_pipeline = eval(self.pipelines[index])
                curr_pipeline.build()
                if curr_pipeline.executed:
                    n_executed += 1
                else:
                    no_errors = False
            if no_errors:
                print("Workflow executed successfully in {} secs.".format(elapsed_secs(self.started)))
                self.output = curr_pipeline.output
                self.executed = True
            else:
                print("Workflow halted due to failed pipeline: {} ({} of {}). Duration: {} secs.".format(self.pipelines[index], index+1, len(self.pipelines), elapsed_secs(self.started)))
        else:
            pass

def context_switch(conditionals, default):
    '''
        A context switch will constrain flow routing to a function, pipeline or workflow
        depending on the first flag boolean in the "conditionals" array (of tuples) to evaluate to True.
        If no flag booleans evaluate to True, the default object is assigned.
    '''
    selected = None
    for conditional in conditionals:
        flag_boolean, object_name = conditional
        if flag_boolean:
            selected = object_name
            break
    if selected:
        return selected
    else:
        return default

# ----------------------------- WORKSPACE -----------------------------------

# register applicable tests for your functions

testEngine.add_test("package", "get_sum", "real_only")
testEngine.add_test("unit", "get_sum", ("test1", [1,2,3], [6]))  # array in, array out
testEngine.add_test("package", "times_two", "real_only")
testEngine.add_test("unit", "times_two", ("test1", [1,2,3], [2,4,6]))  # array in, array out

# Initialize application flags

flags.set("times_two_output", [])

def sample_function(package):
    global flags
    '''
        A test-driven atomic function example. Supports message-passing between functions
        via the flags interface (global mutable state)
    '''
    func_name = "sample_function"
    output = []
    try:
        # function code goes here
        pass
    except Exception as error:
        print("error at function: {} --> {}".format(func_name, str(error)))
    return output # [...] - output must always be an array

def get_sum(package):
    global flags
    '''
        get sum of numbers in package
    '''
    func_name = "get_sum"
    output = []
    try:
        output = [sum(package)]
    except Exception as error:
        print("error at function: {} --> {}".format(func_name, str(error)))
    return output # [...] - output must always be an array

def times_two(package):
    global flags
    '''
        get two times all the numbers in a package
    '''
    func_name = "times_two"
    output = []
    try:
        output = [x for x in map(lambda x: x*2, package)]
        # use flags to update state
        times_two_output = flags.get("times_two_output")
        if times_two_output:
            times_two_output += output
        else:
            times_two_output = output
        flags.set("times_two_output", times_two_output)
    except Exception as error:
        print("error at function: {} --> {}".format(func_name, str(error)))
    return output # [...] - output must always be an array

# A sample pipeline
sample_pipeline = Pipeline([
    ("get_sum", [1,2.44,3]),
    "times_two"
])

# Pipeline chaining with context switching
sample_pipeline2 = Pipeline([
    ("get_sum", "sample_pipeline"),
    context_switch([
        (len(flags.get("times_two_output")) % 5 == 0, "get_sum"), # flag-based routing
    ], "times_two")
])

# Sample workflow
sample_workflow = Workflow([
   "sample_pipeline",
   "sample_pipeline2"
])

# Workflow looping
sample_workflow_loop = Workflow(["sample_workflow" for i in range(2)]) # loop workflow 10 times

#sample_workflow_loop.run()
#print(sample_workflow_loop.output)
#print(flags.get("times_two_output"))
